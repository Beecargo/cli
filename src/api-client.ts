import { getApiBaseUrl, resolveApiKey } from "./env.js";

export type ApiResult<T = unknown> = {
  ok: boolean;
  status: number;
  body: T;
};

type CallOptions = {
  apiKey?: string | null;
  method: string;
  path: string;
  body?: unknown;
  formData?: FormData;
  timeoutMs?: number;
  idempotencyKey?: string;
};

function fetchTimeoutMs(): number {
  const n = Number(process.env.BEECARGO_API_FETCH_TIMEOUT_MS ?? "300000");
  return Number.isFinite(n) && n > 0 ? n : 300_000;
}

/** Thin JSON fetch wrapper for the Beecargo REST API. */
export const callApi = async <T = unknown>(
  options: CallOptions,
): Promise<ApiResult<T>> => {
  const base = getApiBaseUrl();
  const path = options.path.startsWith("/") ? options.path : `/${options.path}`;
  const url = `${base}${path}`;
  const apiKey = options.apiKey !== undefined ? options.apiKey : resolveApiKey();

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "beecargo-cli/0.1.0",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  let body: BodyInit | undefined;
  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? fetchTimeoutMs(),
  );
  try {
    const res = await fetch(url, {
      method: options.method,
      headers,
      body,
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* plain text */
    }
    return { ok: res.ok, status: res.status, body: parsed as T };
  } finally {
    clearTimeout(timer);
  }
};

/** PUT bytes to a presigned R2 URL; returns normalized ETag. */
export const putPresignedPart = async (url: string, data: Buffer): Promise<string> => {
  const res = await fetch(url, {
    method: "PUT",
    body: Uint8Array.from(data),
  });
  if (!res.ok) {
    throw new Error(`Part upload failed (${res.status})`);
  }
  const etag = res.headers.get("etag") ?? res.headers.get("ETag");
  if (!etag) {
    throw new Error("Missing ETag from part upload");
  }
  return etag.replaceAll('"', "");
};
