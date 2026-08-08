/** Multipart threshold aligned with Beecargo API (4 MiB). */
export const MULTIPART_THRESHOLD_BYTES = 4 * 1024 * 1024;

/** Format a byte count for CLI progress output. */
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
};
