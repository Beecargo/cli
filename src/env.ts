export const getApiBaseUrl = (): string =>
  (process.env.BEECARGO_API_URL ?? "https://api.beecargo.net").replace(/\/$/, "");

export const getAppBaseUrl = (): string =>
  (process.env.BEECARGO_APP_URL ?? "https://beecargo.net").replace(/\/$/, "");

export const resolveApiKey = (flagKey?: string): string | null => {
  const key = flagKey ?? process.env.BEECARGO_API_KEY ?? null;
  return key && key.length > 0 ? key : null;
};
