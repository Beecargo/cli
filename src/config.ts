import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type BeecargoConfig = {
  apiKey?: string;
};

/** Resolve ~/.config/beecargo/config.json (or $XDG_CONFIG_HOME). */
export const configPath = (): string => {
  const base =
    process.env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), ".config");
  return path.join(base, "beecargo", "config.json");
};

/** Load saved CLI config; returns empty object when missing/invalid. */
export const loadConfig = async (): Promise<BeecargoConfig> => {
  try {
    const raw = await readFile(configPath(), "utf8");
    const parsed = JSON.parse(raw) as BeecargoConfig;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

/** Persist CLI config (merges with existing). */
export const saveConfig = async (patch: BeecargoConfig): Promise<string> => {
  const file = configPath();
  await mkdir(path.dirname(file), { recursive: true });
  const current = await loadConfig();
  const next: BeecargoConfig = { ...current, ...patch };
  await writeFile(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return file;
};
