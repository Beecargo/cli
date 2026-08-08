import { loadConfig } from "./config.js";

export const getApiBaseUrl = (): string =>
  (process.env.BEECARGO_API_URL ?? "https://api.beecargo.net").replace(/\/$/, "");

export const getAppBaseUrl = (): string =>
  (process.env.BEECARGO_APP_URL ?? "https://beecargo.net").replace(/\/$/, "");

let cachedConfigKey: string | null | undefined;

/** Resolve API key from flag, env, or ~/.config/beecargo/config.json. */
export const resolveApiKey = (flagKey?: string): string | null => {
  if (flagKey && flagKey.length > 0) return flagKey;
  const fromEnv = process.env.BEECARGO_API_KEY;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return null;
};

/** Async key resolve including saved config (for commands that can await). */
export const resolveApiKeyAsync = async (
  flagKey?: string,
): Promise<string | null> => {
  const sync = resolveApiKey(flagKey);
  if (sync) return sync;
  if (cachedConfigKey !== undefined) return cachedConfigKey;
  const cfg = await loadConfig();
  const key =
    typeof cfg.apiKey === "string" && cfg.apiKey.length > 0 ? cfg.apiKey : null;
  cachedConfigKey = key;
  return key;
};
