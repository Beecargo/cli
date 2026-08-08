import { createHash } from "node:crypto";
import { open, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { callApi, putPresignedPart } from "./api-client.js";
import { emitPublishResult } from "./agent-commands.js";
import { MULTIPART_THRESHOLD_BYTES } from "./format.js";
import { mapPool, multipartUploadConcurrency } from "./multipart-concurrency.js";
import {
  appendPublishFields,
  type PublishOptions,
  withPublishFields,
} from "./publish-options.js";
import { apiError } from "./api-error.js";
import { createProgressBar, printError } from "./tui.js";

type PublicFile = {
  id: string;
  shortId?: string;
  sharePath?: string;
  deletionToken?: string;
  claimToken?: string;
  sha256?: string;
  content_sha256?: string;
  agentLink?: string;
  agent_link?: string;
  downloadUrl?: string;
  unlockCode?: string;
  handoffUrl?: string;
};

type UploadOptions = {
  apiKey?: string | null;
  folderId?: string;
  idempotencyKey?: string;
  clientEncryption?: string;
  publish?: PublishOptions;
};

/** Read one multipart slice from disk without loading the whole file. */
const readPartSlice = async (
  filePath: string,
  start: number,
  length: number,
): Promise<Buffer> => {
  const handle = await open(filePath, "r");
  try {
    const buf = Buffer.allocUnsafe(length);
    const { bytesRead } = await handle.read(buf, 0, length, start);
    return bytesRead === length ? buf : buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

/** One-shot local upload: direct under 4MB, streamed multipart otherwise. */
export const uploadLocalFile = async (
  filePath: string,
  options: UploadOptions,
): Promise<PublicFile> => {
  const abs = path.resolve(filePath);
  const fileName = path.basename(abs);
  const fileSize = (await stat(abs)).size;
  const contentType = "application/octet-stream";
  const encryptionFields = options.clientEncryption
    ? { clientEncryption: options.clientEncryption }
    : {};

  const publish = options.publish ?? {};

  if (fileSize < MULTIPART_THRESHOLD_BYTES) {
    const buffer = await readFile(abs);
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: contentType }), fileName);
    if (options.folderId) form.append("folderId", options.folderId);
    if (options.clientEncryption) {
      form.append("clientEncryption", options.clientEncryption);
    }
    appendPublishFields(form, publish);
    const res = await callApi<{ success: boolean; data: PublicFile }>({
      apiKey: options.apiKey,
      method: "POST",
      path: "/files/upload",
      formData: form,
      idempotencyKey: options.idempotencyKey,
    });
    if (!res.ok) throw new Error(apiError(res.body, "Upload failed"));
    const body = res.body as { success?: boolean; data?: PublicFile };
    if (!body.data?.id) throw new Error(apiError(res.body, "Upload failed"));
    return body.data;
  }

  const progress = createProgressBar(fileName);
  let uploadedBytes = 0;
  progress.update(0, fileSize);

  const init = await callApi<{
    uploadId: string;
    key: string;
    chunkSize: number;
    totalParts: number;
    uploadSessionToken?: string;
  }>({
    apiKey: options.apiKey,
    method: "POST",
    path: "/files/multipart/init",
    body: {
      fileName,
      fileSize,
      fileType: contentType,
      folderId: options.folderId ?? null,
      ...encryptionFields,
    },
    idempotencyKey: options.idempotencyKey,
  });
  if (!init.ok) {
    progress.stop();
    throw new Error(apiError(init.body, "Upload failed"));
  }

  const { uploadId, key, chunkSize, totalParts, uploadSessionToken } = init.body;
  const partNumbers = Array.from({ length: totalParts }, (_, index) => index + 1);

  const partDigests: Record<string, string> = {};
  try {
    for (const partNumber of partNumbers) {
      const start = (partNumber - 1) * chunkSize;
      const end = Math.min(start + chunkSize, fileSize);
      const slice = await readPartSlice(abs, start, end - start);
      partDigests[String(partNumber)] = createHash("sha256")
        .update(slice)
        .digest("hex");
    }
  } catch (error) {
    progress.stop();
    throw error;
  }

  const urlsRes = await callApi<{ success: boolean; urls: Record<string, string> }>({
    apiKey: options.apiKey,
    method: "POST",
    path: "/files/multipart/batch-urls",
    body: {
      key,
      uploadId,
      totalParts,
      partDigests,
      ...(uploadSessionToken ? { uploadSessionToken } : {}),
    },
  });
  if (!urlsRes.ok || !urlsRes.body.urls) {
    progress.stop();
    throw new Error(apiError(urlsRes.body, "Upload failed"));
  }

  const loadedByPart = new Array<number>(totalParts).fill(0);
  const reportProgress = () => {
    uploadedBytes = loadedByPart.reduce((sum, value) => sum + value, 0);
    progress.update(Math.min(uploadedBytes, fileSize), fileSize);
  };

  let parts: { partNumber: number; etag: string }[];
  try {
    parts = await mapPool(
      partNumbers,
      multipartUploadConcurrency(fileSize),
      async (partNumber) => {
        const start = (partNumber - 1) * chunkSize;
        const end = Math.min(start + chunkSize, fileSize);
        const slice = await readPartSlice(abs, start, end - start);
        const url = urlsRes.body.urls[String(partNumber)];
        if (!url) {
          throw new Error(`Missing presigned URL for part ${partNumber}`);
        }
        const etag = await putPresignedPart(url, slice);
        loadedByPart[partNumber - 1] = slice.byteLength;
        reportProgress();
        return { partNumber, etag };
      },
    );
  } catch (error) {
    progress.stop();
    throw error;
  }
  parts.sort((a, b) => a.partNumber - b.partNumber);

  const complete = await callApi<{
    success: boolean;
    file: PublicFile;
  }>({
    apiKey: options.apiKey,
    method: "POST",
    path: "/files/multipart/complete",
    body: withPublishFields(
      {
        key,
        uploadId,
        parts,
        fileName,
        fileSize,
        contentType,
        folderId: options.folderId ?? null,
        ...encryptionFields,
      },
      publish,
    ),
    idempotencyKey: options.idempotencyKey
      ? `${options.idempotencyKey}:complete`
      : undefined,
  });
  progress.stop();
  if (!complete.ok) throw new Error(apiError(complete.body, "Upload failed"));
  const file = (complete.body as { file?: PublicFile }).file;
  if (!file?.id) throw new Error(apiError(complete.body, "Upload failed"));
  return file;
};

export const uploadLocalFileWithUi = async (
  filePath: string,
  options: UploadOptions & { json?: boolean },
) => {
  try {
    const file = await uploadLocalFile(filePath, options);
    emitPublishResult(file as Record<string, unknown>, { json: options.json });
    if (!options.json) {
      if (options.clientEncryption === "age") {
        console.log(
          "Encrypted before upload. Beecargo stores ciphertext only — decrypt offline with your age identity.",
        );
      }
      if (file.deletionToken) {
        console.log(`deletionToken: ${file.deletionToken}`);
      }
      if (file.claimToken) {
        console.log(`claimToken: ${file.claimToken}`);
      }
      if (file.unlockCode) {
        console.log(`unlockCode: ${file.unlockCode}`);
      }
      if (file.handoffUrl) {
        console.log(`handoffUrl: ${file.handoffUrl}`);
      }
    }
    return file;
  } catch (e) {
    printError(e instanceof Error ? e.message : "Upload failed");
    process.exitCode = 1;
    throw e;
  }
};
