import { getAppBaseUrl } from "./env.js";

export type PublishPayload = Record<string, unknown>;

/** Normalize API file payload for `--json` output. */
export function formatPublishJson(data: PublishPayload): string {
  const app = getAppBaseUrl();
  const shortId =
    typeof data.shortId === "string"
      ? data.shortId
      : typeof data.short_id === "string"
        ? data.short_id
        : undefined;
  const sharePath =
    typeof data.sharePath === "string"
      ? data.sharePath
      : shortId
        ? `/d/${shortId}`
        : undefined;
  const shareUrl =
    typeof data.shareUrl === "string"
      ? data.shareUrl
      : sharePath
        ? `${app}${sharePath.startsWith("/") ? sharePath : `/${sharePath}`}`
        : undefined;

  const out: Record<string, unknown> = {
    fileId: data.id ?? data.fileId,
    shortId,
    shareUrl,
    human_link: data.human_link ?? data.humanLink ?? shareUrl,
    agent_link:
      data.agent_link ?? data.agentLink ?? data.downloadUrl ?? data.download_url,
    sha256: data.sha256 ?? data.content_sha256,
    expiresAt: data.expiresAt ?? data.expires_at,
    deletionToken: data.deletionToken,
    claimToken: data.claimToken,
    unlockCode: data.unlockCode,
    handoffUrl: data.handoffUrl,
    runId: data.runId ?? data.run_id,
    idempotent: data.idempotent,
  };
  for (const key of Object.keys(out)) {
    if (out[key] === undefined) delete out[key];
  }
  return JSON.stringify(out, null, 2);
}
