/** Extract a human-readable error string from a Beecargo API JSON body. */
export const apiError = (body: unknown, fallback = "Request failed"): string => {
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (typeof o.error === "string") return o.error;
    const data = o.data;
    if (
      data &&
      typeof data === "object" &&
      typeof (data as { error?: string }).error === "string"
    ) {
      return (data as { error: string }).error;
    }
  }
  return fallback;
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
