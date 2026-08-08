/**
 * Smoke: upload a tiny buffer via direct upload (requires BEECARGO_API_URL).
 */
import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { uploadLocalFile } from "../src/upload-local.js";

const run = async () => {
  const tmp = path.join(os.tmpdir(), `beecargo-cli-smoke-${Date.now()}.txt`);
  await writeFile(tmp, "beecargo cli smoke\n");
  try {
    const file = await uploadLocalFile(tmp, { apiKey: process.env.BEECARGO_API_KEY });
    console.log(JSON.stringify({ ok: true, id: file.id, sharePath: file.sharePath }));
  } finally {
    await unlink(tmp).catch(() => {});
  }
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
