import cliProgress from "cli-progress";
import pc from "picocolors";
import { getAppBaseUrl } from "./env.js";
import { formatBytes } from "./format.js";

export type ProgressHandle = {
  update: (loaded: number, total: number, label?: string) => void;
  stop: () => void;
};

/** Single-line terminal progress bar for uploads and remote jobs. */
export const createProgressBar = (title: string): ProgressHandle => {
  const bar = new cliProgress.SingleBar(
    {
      format:
        pc.cyan(title) + " |" + pc.green("{bar}") + "| {percentage}% | {value}/{total}",
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic,
  );
  bar.start(1, 0, { total: "…" });
  return {
    update: (loaded, total, label) => {
      const barTotal = total > 0 ? total : 1;
      bar.setTotal(barTotal);
      bar.update(total > 0 ? loaded : 0, {
        total: total > 0 ? formatBytes(total) : (label ?? "…"),
      });
    },
    stop: () => {
      bar.stop();
    },
  };
};

export const printShareResult = (sharePath: string | null | undefined) => {
  if (!sharePath) return;
  const app = getAppBaseUrl();
  const url = sharePath.startsWith("http")
    ? sharePath
    : `${app}${sharePath.startsWith("/") ? sharePath : `/${sharePath}`}`;
  console.log(pc.green(`Share: ${url}`));
};

export const printError = (message: string) => {
  console.error(pc.red(message));
};
