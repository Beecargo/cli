/** Extract a human-readable error string from a Beecargo API JSON body. */
export const apiError = (body: unknown, fallback = "Request failed"): string => {
  if (!body || typeof body !== "object") return fallback;
  const o = body as Record<string, unknown>;

  let message: string | null = null;
  let limitKind: string | null = null;
  let upgradeEligible = false;
  let upgradeUrl: string | null = null;

  if (typeof o.error === "string") {
    message = o.error;
    if (typeof o.limitKind === "string") limitKind = o.limitKind;
    if (o.upgradeEligible === true) upgradeEligible = true;
    if (typeof o.upgradeUrl === "string") upgradeUrl = o.upgradeUrl;
  } else if (
    o.error &&
    typeof o.error === "object" &&
    typeof (o.error as { message?: unknown }).message === "string"
  ) {
    const err = o.error as {
      message: string;
      details?: Record<string, unknown>;
    };
    message = err.message;
    const details = err.details;
    if (details && typeof details === "object") {
      if (typeof details.limitKind === "string") limitKind = details.limitKind;
      if (details.upgradeEligible === true) upgradeEligible = true;
      if (typeof details.upgradeUrl === "string") upgradeUrl = details.upgradeUrl;
    }
  }

  const nested = o.data;
  if (
    !message &&
    nested &&
    typeof nested === "object" &&
    typeof (nested as { error?: unknown }).error === "string"
  ) {
    const data = nested as Record<string, unknown>;
    message = data.error as string;
    if (typeof data.limitKind === "string") limitKind = data.limitKind;
    if (data.upgradeEligible === true) upgradeEligible = true;
    if (typeof data.upgradeUrl === "string") upgradeUrl = data.upgradeUrl;
  }

  if (!message) return fallback;

  if (upgradeEligible || limitKind) {
    const url = upgradeUrl ?? "https://beecargo.net/pricing";
    return `${message}\nUpgrade: ${url}`;
  }
  return message;
};

/** Unwrap `{ data: T }` envelope when present. */
export const unwrapData = <T extends Record<string, unknown>>(
  body: unknown,
): T | null => {
  if (!body || typeof body !== "object") return null;
  const o = body as { data?: unknown };
  if (o.data && typeof o.data === "object") return o.data as T;
  return body as T;
};
