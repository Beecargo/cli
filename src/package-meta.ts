import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** CLI package version from package.json (dist/../package.json). */
export const CLI_VERSION: string = (() => {
  try {
    const pkg = require("../package.json") as { version?: string };
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

export const CLI_USER_AGENT = `beecargo-cli/${CLI_VERSION}`;
