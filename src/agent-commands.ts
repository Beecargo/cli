import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { callApi } from "./api-client.js";
import { apiError, unwrapData } from "./api-error.js";
import { formatPublishJson } from "./publish-json.js";
import { createProgressBar, printError, printShareResult } from "./tui.js";

type FileRow = Record<string, unknown>;

/** Batch metadata by short codes (`file_code`). */
export async function cmdInfo(
  fileCode: string,
  options: { apiKey?: string | null; json?: boolean },
): Promise<void> {
  const res = await callApi({
    apiKey: options.apiKey,
    method: "GET",
    path: `/files/info?file_code=${encodeURIComponent(fileCode)}`,
  });
  if (!res.ok) {
    printError(apiError(res.body));
    process.exitCode = 1;
    return;
  }
  if (options.json) {
    console.log(JSON.stringify(res.body, null, 2));
    return;
  }
  console.log(JSON.stringify(res.body, null, 2));
}

export async function cmdList(options: {
  apiKey?: string | null;
  json?: boolean;
  page?: number;
  limit?: number;
  includeFolders?: boolean;
  folderId?: string;
}): Promise<void> {
  const page = options.page ?? 1;
  const limit = options.limit ?? 50;
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    includeFolders: options.includeFolders ? "true" : "false",
  });
  if (options.folderId) params.set("folderId", options.folderId);
  const res = await callApi({
    apiKey: options.apiKey,
    method: "GET",
    path: `/files/list?${params.toString()}`,
  });
  if (!res.ok) {
    printError(apiError(res.body));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(res.body, null, 2));
}

export async function cmdDelete(
  fileId: string,
  options: {
    apiKey?: string | null;
    token?: string;
    json?: boolean;
    force?: boolean;
  },
): Promise<void> {
  const params = new URLSearchParams({ fileId });
  if (options.token) params.set("token", options.token);
  if (options.force) params.set("force", "true");
  const res = await callApi({
    apiKey: options.apiKey,
    method: "DELETE",
    path: `/files/delete?${params.toString()}`,
  });
  if (!res.ok) {
    printError(apiError(res.body));
    process.exitCode = 1;
    return;
  }
  if (options.json) {
    console.log(JSON.stringify(res.body, null, 2));
  } else {
    console.log("Deleted");
  }
}

/** Download via machine `GET /files/download/:fileId` (unlock-aware). */
function scanPendingDelaySeconds(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const row = body as Record<string, unknown>;
  const nested =
    row.error && typeof row.error === "object"
      ? (row.error as Record<string, unknown>)
      : null;
  const details =
    nested?.details && typeof nested.details === "object"
      ? (nested.details as Record<string, unknown>)
      : row;
  const pending =
    details.scanPending === true ||
    row.scanPending === true ||
    nested?.errorCode === "SCAN_PENDING" ||
    row.errorCode === "SCAN_PENDING";
  if (!pending) return null;
  const retry =
    typeof details.retryAfterSeconds === "number"
      ? details.retryAfterSeconds
      : typeof row.retryAfterSeconds === "number"
        ? row.retryAfterSeconds
        : 15;
  return Math.max(1, Math.min(60, Math.floor(retry)));
}

export async function cmdDownload(
  fileId: string,
  destPath: string,
  options: {
    apiKey?: string | null;
    sha256?: string;
    json?: boolean;
    unlockCode?: string;
    unlockToken?: string;
    handoffToken?: string;
    purchaseToken?: string;
  },
): Promise<void> {
  const params = new URLSearchParams();
  if (options.unlockCode) params.set("unlockCode", options.unlockCode);
  if (options.unlockToken) params.set("unlockToken", options.unlockToken);
  if (options.handoffToken) params.set("handoffToken", options.handoffToken);
  if (options.purchaseToken) params.set("purchaseToken", options.purchaseToken);
  const qs = params.toString();
  const path = `/files/download/${encodeURIComponent(fileId)}${qs ? `?${qs}` : ""}`;

  let mint: Awaited<ReturnType<typeof callApi>> | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    mint = await callApi<{
      success?: boolean;
      data?: { url?: string; downloadUrl?: string; sha256?: string };
      url?: string;
      downloadUrl?: string;
    }>({
      apiKey: options.apiKey,
      method: "GET",
      path,
    });
    if (mint.ok) break;
    const delay = scanPendingDelaySeconds(mint.body);
    if (delay == null || attempt === 4) {
      printError(
        delay != null
          ? "Safety check still running. Try again shortly."
          : apiError(mint.body),
      );
      process.exitCode = 1;
      return;
    }
    if (!options.json) {
      printError(`Safety check in progress — retrying in ${delay}s…`);
    }
    await new Promise((resolve) => setTimeout(resolve, delay * 1000));
  }
  if (!mint?.ok) {
    printError(apiError(mint?.body));
    process.exitCode = 1;
    return;
  }
  const body = mint.body as {
    data?: { url?: string; downloadUrl?: string; sha256?: string };
    url?: string;
    downloadUrl?: string;
  };
  const url = body.data?.url ?? body.data?.downloadUrl ?? body.url ?? body.downloadUrl;
  if (!url) {
    printError("No download URL in response");
    process.exitCode = 1;
    return;
  }
  const fileRes = await fetch(url);
  if (!fileRes.ok || !fileRes.body) {
    printError(`Download failed (${fileRes.status})`);
    process.exitCode = 1;
    return;
  }
  const totalHeader = fileRes.headers.get("content-length");
  const total = totalHeader ? Number(totalHeader) : 0;
  const progress =
    !options.json && Number.isFinite(total) && total > 0
      ? createProgressBar(destPath)
      : null;
  let loaded = 0;
  progress?.update(0, total);

  const hash = createHash("sha256");
  const out = createWriteStream(destPath);
  const reader = Readable.fromWeb(
    fileRes.body as import("node:stream/web").ReadableStream,
  );
  reader.on("data", (chunk: Buffer) => {
    hash.update(chunk);
    loaded += chunk.length;
    progress?.update(loaded, total > 0 ? total : loaded);
  });
  try {
    await pipeline(reader, out);
  } finally {
    progress?.stop();
  }
  const digest = hash.digest("hex");
  if (options.sha256 && options.sha256.toLowerCase() !== digest.toLowerCase()) {
    printError(`sha256 mismatch: expected ${options.sha256}, got ${digest}`);
    process.exitCode = 1;
    return;
  }
  if (options.json) {
    console.log(JSON.stringify({ fileId, path: destPath, sha256: digest }, null, 2));
  } else {
    console.log(`Saved ${destPath} (sha256 ${digest})`);
  }
}

export function emitPublishResult(data: FileRow, options: { json?: boolean }): void {
  if (options.json) {
    console.log(formatPublishJson(data));
    return;
  }
  const sharePath =
    typeof data.sharePath === "string"
      ? data.sharePath
      : typeof data.shortId === "string"
        ? `/d/${data.shortId}`
        : undefined;
  printShareResult(sharePath);
  const sha = data.sha256 ?? data.content_sha256;
  if (typeof sha === "string") console.log(`sha256: ${sha}`);
  const agent = data.agentLink ?? data.agent_link ?? data.downloadUrl;
  if (typeof agent === "string") console.log(`Agent link: ${agent}`);
  if (typeof data.unlockCode === "string") {
    console.log(`unlockCode: ${data.unlockCode}`);
  }
  if (typeof data.handoffUrl === "string") {
    console.log(`handoffUrl: ${data.handoffUrl}`);
  }
}

export { unwrapData };
