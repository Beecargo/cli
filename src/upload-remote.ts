import { getApiBaseUrl } from "./env.js";
import { callApi } from "./api-client.js";
import { emitPublishResult } from "./agent-commands.js";
import { apiError } from "./api-error.js";
import { type PublishOptions, withPublishFields } from "./publish-options.js";
import { createProgressBar, printError } from "./tui.js";

type JobStatus = {
  jobId: string;
  status: string;
  bytesDone: number;
  bytesTotal: number | null;
  percent: number | null;
  fileId: string | null;
  shortId: string | null;
  sharePath: string | null;
  name: string | null;
  error: string | null;
};

type PublicFile = {
  id: string;
  shortId?: string;
  sharePath?: string;
  deletionToken?: string;
  claimToken?: string;
  unlockCode?: string;
  handoffUrl?: string;
};

const parseSseEvents = (chunk: string, onEvent: (data: JobStatus) => void) => {
  const blocks = chunk.split("\n\n");
  for (const block of blocks) {
    const dataLine = block.split("\n").find((line) => line.startsWith("data: "));
    if (!dataLine) continue;
    try {
      const parsed = JSON.parse(dataLine.slice(6)) as JobStatus;
      onEvent(parsed);
    } catch {
      /* ignore partial JSON */
    }
  }
};

const watchJobSse = async (
  jobId: string,
  jobSecret: string | null,
  apiKey: string | null,
  onStatus: (status: JobStatus) => void,
): Promise<JobStatus> => {
  const base = getApiBaseUrl();
  const headers: Record<string, string> = { Accept: "text/event-stream" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const secretQ = jobSecret ? `?secret=${encodeURIComponent(jobSecret)}` : "";
  const res = await fetch(`${base}/files/remote-multipart/${jobId}/events${secretQ}`, {
    headers,
  });
  if (!res.ok || !res.body) {
    throw new Error(`SSE failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let last: JobStatus | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    parseSseEvents(buffer, (data) => {
      last = data;
      onStatus(data);
    });
    const lastSep = buffer.lastIndexOf("\n\n");
    if (lastSep >= 0) buffer = buffer.slice(lastSep + 2);
  }

  if (!last) throw new Error("No job events received");
  return last;
};

const pollJobStatus = async (
  jobId: string,
  jobSecret: string | null,
  apiKey: string | null,
  onStatus: (status: JobStatus) => void,
): Promise<JobStatus> => {
  const secretQ = jobSecret ? `?secret=${encodeURIComponent(jobSecret)}` : "";
  for (;;) {
    const res = await callApi<{ success: boolean; data: JobStatus }>({
      apiKey,
      method: "GET",
      path: `/files/remote-multipart/${jobId}${secretQ}`,
    });
    if (!res.ok) throw new Error(apiError(res.body, "Remote upload failed"));
    const data = (res.body as { data: JobStatus }).data;
    onStatus(data);
    if (data.status === "completed" || data.status === "failed") {
      return data;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
};

const updateProgressFromJob = (
  progress: ReturnType<typeof createProgressBar>,
  job: JobStatus,
) => {
  const total = job.bytesTotal ?? 0;
  const done = job.bytesDone ?? 0;
  if (total > 0) {
    progress.update(done, total, job.status);
  } else {
    progress.update(0, 0, job.status);
  }
};

/** Import a public HTTPS URL; async mode uses SSE with poll fallback. */
export const uploadRemoteUrl = async (
  url: string,
  options: {
    apiKey?: string | null;
    async?: boolean;
    folderId?: string;
    publish?: PublishOptions;
  },
): Promise<PublicFile | JobStatus> => {
  const publish = options.publish ?? {};
  if (!options.async) {
    const progress = createProgressBar("remote");
    progress.update(0, 0, "fetching…");
    const res = await callApi<{ success: boolean; data: PublicFile }>({
      apiKey: options.apiKey,
      method: "POST",
      path: "/files/remote-upload",
      body: withPublishFields({ url, folderId: options.folderId ?? null }, publish),
    });
    progress.stop();
    if (!res.ok) throw new Error(apiError(res.body, "Remote upload failed"));
    const data = (res.body as { data?: PublicFile }).data;
    if (!data?.id) throw new Error(apiError(res.body, "Remote upload failed"));
    return data;
  }

  const init = await callApi<{
    success: boolean;
    data: { jobId: string; status: string; jobSecret?: string };
  }>({
    apiKey: options.apiKey,
    method: "POST",
    path: "/files/remote-multipart/init",
    body: withPublishFields({ url, folderId: options.folderId ?? null }, publish),
  });
  if (!init.ok) throw new Error(apiError(init.body, "Remote upload failed"));
  const initData = (init.body as { data: { jobId: string; jobSecret?: string } }).data;
  const jobId = initData.jobId;
  const jobSecret = initData.jobSecret ?? null;

  const progress = createProgressBar("remote job");
  const onStatus = (job: JobStatus) => updateProgressFromJob(progress, job);

  let final: JobStatus;
  try {
    final = await watchJobSse(jobId, jobSecret, options.apiKey ?? null, onStatus);
  } catch {
    final = await pollJobStatus(jobId, jobSecret, options.apiKey ?? null, onStatus);
  }
  progress.stop();

  if (final.status === "failed") {
    throw new Error(final.error ?? "Remote job failed");
  }
  return final;
};

export const uploadRemoteUrlWithUi = async (
  url: string,
  options: {
    apiKey?: string | null;
    async?: boolean;
    folderId?: string;
    json?: boolean;
    publish?: PublishOptions;
  },
) => {
  try {
    const result = await uploadRemoteUrl(url, options);
    if ("id" in result && result.id) {
      emitPublishResult(result as Record<string, unknown>, { json: options.json });
      if (!options.json) {
        if (result.deletionToken) {
          console.log(`deletionToken: ${result.deletionToken}`);
        }
        if (result.claimToken) {
          console.log(`claimToken: ${result.claimToken}`);
        }
        if (result.unlockCode) {
          console.log(`unlockCode: ${result.unlockCode}`);
        }
        if (result.handoffUrl) {
          console.log(`handoffUrl: ${result.handoffUrl}`);
        }
      }
      return result;
    }
    if ("sharePath" in result && result.sharePath) {
      emitPublishResult(result as Record<string, unknown>, { json: options.json });
      return result;
    }
    emitPublishResult(result as Record<string, unknown>, { json: options.json });
    return result;
  } catch (e) {
    printError(e instanceof Error ? e.message : "Remote upload failed");
    process.exitCode = 1;
    throw e;
  }
};
