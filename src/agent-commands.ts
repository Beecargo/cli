import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { callApi } from "./api-client.js";
import { formatPublishJson } from "./publish-json.js";
import { printError, printShareResult } from "./tui.js";

type FileRow = Record<string, unknown>;

function apiError(body: unknown): string {
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (typeof o.error === "string") return o.error;
    const data = o.data;
    if (
      data &&
      typeof data === "object" &&
      typeof (data as { error?: string }).error === "string"
    ) {
      return (data as { error: string }).error;
    }
  }
  return "Request failed";
}

function unwrapData(body: unknown): FileRow | null {
  if (!body || typeof body !== "object") return null;
  const o = body as { data?: unknown; success?: boolean };
  if (o.data && typeof o.data === "object") return o.data as FileRow;
  return body as FileRow;
}

export async function cmdInfo(
  fileId: string,
  options: { apiKey?: string | null; json?: boolean },
): Promise<void> {
  const res = await callApi({
    apiKey: options.apiKey,
    method: "GET",
    path: `/files/info?fileId=${encodeURIComponent(fileId)}`,
  });
  if (!res.ok) {
    printError(apiError(res.body));
    process.exitCode = 1;
    return;
  }
  const data = unwrapData(res.body);
  if (!data) {
    printError("Empty response");
    process.exitCode = 1;
    return;
  }
  if (options.json) {
    console.log(formatPublishJson(data));
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}

export async function cmdList(options: {
  apiKey?: string | null;
  json?: boolean;
  page?: number;
  limit?: number;
}): Promise<void> {
  const page = options.page ?? 1;
  const limit = options.limit ?? 50;
  const res = await callApi({
    apiKey: options.apiKey,
    method: "GET",
    path: `/files/list?page=${page}&limit=${limit}&includeFolders=false`,
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

export async function cmdDownload(
  fileId: string,
  destPath: string,
  options: {
    apiKey?: string | null;
    sha256?: string;
    json?: boolean;
  },
): Promise<void> {
  const grant = await callApi<{
    downloadUrl?: string;
    data?: { downloadUrl?: string };
  }>({
    apiKey: options.apiKey,
    method: "POST",
    path: "/downloads/grant",
    body: { fileId },
  });
  if (!grant.ok) {
    printError(apiError(grant.body));
    process.exitCode = 1;
    return;
  }
  const body = grant.body as { downloadUrl?: string; data?: { downloadUrl?: string } };
  const url = body.downloadUrl ?? body.data?.downloadUrl;
  if (!url) {
    printError("No download URL in grant response");
    process.exitCode = 1;
    return;
  }
  const fileRes = await fetch(url);
  if (!fileRes.ok || !fileRes.body) {
    printError(`Download failed (${fileRes.status})`);
    process.exitCode = 1;
    return;
  }
  const hash = createHash("sha256");
  const out = createWriteStream(destPath);
  const reader = Readable.fromWeb(
    fileRes.body as import("node:stream/web").ReadableStream,
  );
  reader.on("data", (chunk: Buffer) => hash.update(chunk));
  await pipeline(reader, out);
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
}
