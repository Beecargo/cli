import { callApi } from "./api-client.js";
import { printError } from "./tui.js";

type EventRow = {
  id: number;
  created_at: string;
  event_kind: string;
  route: string | null;
  client_ua_class: string | null;
};

/** Poll download events until a completed delivery or timeout. */
export async function watchDownloads(
  fileId: string,
  options: {
    apiKey?: string | null;
    json?: boolean;
    timeoutMs?: number;
    intervalMs?: number;
  },
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 10 * 60_000;
  const intervalMs = options.intervalMs ?? 2000;
  const started = Date.now();
  let cursor: string | undefined;

  while (Date.now() - started < timeoutMs) {
    const params = new URLSearchParams({ limit: "20" });
    if (cursor) params.set("cursor", cursor);
    const res = await callApi<{ events: EventRow[] }>({
      apiKey: options.apiKey,
      method: "GET",
      path: `/files/${encodeURIComponent(fileId)}/download-events?${params}`,
    });
    if (!res.ok) {
      printError("Failed to list download events");
      process.exitCode = 1;
      return;
    }
    const events = res.body.events ?? [];
    for (const event of events) {
      if (options.json) {
        console.log(JSON.stringify(event));
      } else {
        console.log(
          `${event.created_at} ${event.event_kind} ${event.route ?? ""} ${event.client_ua_class ?? ""}`,
        );
      }
      if (event.event_kind === "completed") {
        return;
      }
    }
    if (events.length) {
      cursor = events[events.length - 1]?.created_at;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  printError("Timed out waiting for download");
  process.exitCode = 1;
}
