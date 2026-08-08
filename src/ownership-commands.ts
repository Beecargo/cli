import { callApi } from "./api-client.js";
import { apiError, unwrapData } from "./api-error.js";
import { registerBootstrapAgent } from "./register-bootstrap.js";
import { saveConfig } from "./config.js";
import { printError } from "./tui.js";

/** Mint a bootstrap bc_* key and optionally persist it. */
export async function cmdRegister(options: {
  label?: string;
  json?: boolean;
  save?: boolean;
}): Promise<void> {
  const res = await registerBootstrapAgent(options.label ?? "cli-agent");
  if (!res.ok) {
    printError(apiError(res.body, "Register failed"));
    process.exitCode = 1;
    return;
  }
  const key = res.body.key;
  if (options.save && key) {
    const path = await saveConfig({ apiKey: key });
    if (!options.json) {
      console.log(`Saved API key to ${path}`);
    }
  }
  if (options.json) {
    console.log(JSON.stringify(res.body, null, 2));
    return;
  }
  if (key) {
    console.log(`API key (shown once): ${key}`);
  }
  if (res.body.key_prefix) console.log(`prefix: ${res.body.key_prefix}`);
  if (res.body.tier) console.log(`tier: ${res.body.tier}`);
  if (res.body.note) console.log(res.body.note);
  if (!options.save) {
    console.log("Tip: pass --save to store the key in ~/.config/beecargo/config.json");
  }
}

/** Attach an anonymous upload to the current API key. */
export async function cmdClaim(
  fileId: string,
  claimToken: string,
  options: { apiKey?: string | null; json?: boolean },
): Promise<void> {
  if (!options.apiKey) {
    printError("API key required (register, --key, or BEECARGO_API_KEY)");
    process.exitCode = 1;
    return;
  }
  const res = await callApi({
    apiKey: options.apiKey,
    method: "POST",
    path: "/files/claim",
    body: { fileId, claimToken },
  });
  if (!res.ok) {
    printError(apiError(res.body, "Claim failed"));
    process.exitCode = 1;
    return;
  }
  if (options.json) {
    console.log(JSON.stringify(res.body, null, 2));
  } else {
    console.log("Claimed");
    console.log(JSON.stringify(res.body, null, 2));
  }
}

/** Create a folder under the authenticated key. */
export async function cmdFolderCreate(
  name: string,
  options: { apiKey?: string | null; parentId?: string; json?: boolean },
): Promise<void> {
  if (!options.apiKey) {
    printError("API key required");
    process.exitCode = 1;
    return;
  }
  const res = await callApi({
    apiKey: options.apiKey,
    method: "POST",
    path: "/folders",
    body: { name, parentId: options.parentId ?? null },
  });
  if (!res.ok) {
    printError(apiError(res.body, "Create folder failed"));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(res.body, null, 2));
}

/** List folders for the authenticated key. */
export async function cmdFolderList(options: {
  apiKey?: string | null;
  parentId?: string;
  page?: number;
  limit?: number;
  json?: boolean;
}): Promise<void> {
  if (!options.apiKey) {
    printError("API key required");
    process.exitCode = 1;
    return;
  }
  const params = new URLSearchParams({
    page: String(options.page ?? 1),
    limit: String(options.limit ?? 50),
  });
  if (options.parentId) params.set("parentId", options.parentId);
  const res = await callApi({
    apiKey: options.apiKey,
    method: "GET",
    path: `/folders/list?${params.toString()}`,
  });
  if (!res.ok) {
    printError(apiError(res.body, "List folders failed"));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(res.body, null, 2));
}

/** Update share settings (MCP beecargo_update_share_settings parity). */
export async function cmdShare(
  fileId: string,
  body: Record<string, unknown>,
  options: { apiKey?: string | null; json?: boolean },
): Promise<void> {
  if (!options.apiKey) {
    printError("API key required");
    process.exitCode = 1;
    return;
  }
  const res = await callApi({
    apiKey: options.apiKey,
    method: "PATCH",
    path: "/files/share-settings",
    body: { fileId, ...body },
  });
  if (!res.ok) {
    printError(apiError(res.body, "Share update failed"));
    process.exitCode = 1;
    return;
  }
  const data = unwrapData(res.body);
  if (options.json) {
    console.log(JSON.stringify(res.body, null, 2));
    return;
  }
  console.log(JSON.stringify(data ?? res.body, null, 2));
}
