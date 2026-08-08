/** Publish / share fields accepted by Beecargo upload APIs (parity with MCP). */

export type PublishOptions = {
  visibility?: "unlisted" | "public";
  direct?: boolean;
  retention?: "ttl" | "forever";
  expiresAt?: string;
  ttl?: string;
  grace?: string | number;
  maxDownloads?: number;
  once?: boolean;
  protect?: boolean;
  handoffMessage?: string;
  runId?: string;
  step?: string;
  intent?: string;
  consumer?: string;
};

export type PublishCliFlags = {
  visibility?: string;
  direct?: boolean;
  retention?: string;
  expiresAt?: string;
  ttl?: string;
  grace?: string;
  maxDownloads?: string;
  once?: boolean;
  protect?: boolean;
  handoffMessage?: string;
  runId?: string;
  step?: string;
  intent?: string;
  consumer?: string;
};

/** Map Commander flags to API publish fields. */
export const publishOptionsFromFlags = (flags: PublishCliFlags): PublishOptions => {
  const out: PublishOptions = {};
  if (flags.visibility === "unlisted" || flags.visibility === "public") {
    out.visibility = flags.visibility;
  }
  if (flags.direct === true) out.direct = true;
  if (flags.retention === "ttl" || flags.retention === "forever") {
    out.retention = flags.retention;
  }
  if (flags.expiresAt) out.expiresAt = flags.expiresAt;
  if (flags.ttl) out.ttl = flags.ttl;
  if (flags.grace !== undefined && flags.grace !== "") {
    const asNum = Number(flags.grace);
    out.grace = Number.isFinite(asNum) && String(asNum) === flags.grace.trim()
      ? asNum
      : flags.grace;
  }
  if (flags.maxDownloads) {
    const n = Number(flags.maxDownloads);
    if (Number.isFinite(n) && n > 0) out.maxDownloads = Math.floor(n);
  }
  if (flags.once === true) out.once = true;
  if (flags.protect === true) out.protect = true;
  if (flags.handoffMessage) out.handoffMessage = flags.handoffMessage;
  if (flags.runId) out.runId = flags.runId;
  if (flags.step) out.step = flags.step;
  if (flags.intent) out.intent = flags.intent;
  if (flags.consumer) out.consumer = flags.consumer;
  return out;
};

/** Append publish fields onto multipart FormData (direct upload). */
export const appendPublishFields = (form: FormData, options: PublishOptions) => {
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === null) continue;
    form.append(key, typeof value === "string" ? value : String(value));
  }
};

/** Merge publish fields into a JSON body. */
export const withPublishFields = <T extends Record<string, unknown>>(
  body: T,
  options: PublishOptions,
): T & PublishOptions => ({ ...body, ...options });
