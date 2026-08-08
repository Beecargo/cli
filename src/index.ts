#!/usr/bin/env node
import { Command } from "commander";
import { cmdDelete, cmdDownload, cmdInfo, cmdList } from "./agent-commands.js";
import { encryptFileForAgeRecipient } from "./age-encrypt.js";
import { resolveApiKey } from "./env.js";
import { callApi } from "./api-client.js";
import { uploadLocalFileWithUi } from "./upload-local.js";
import { uploadRemoteUrlWithUi } from "./upload-remote.js";
import { watchDownloads } from "./watch-downloads.js";
import { printError } from "./tui.js";

const program = new Command();

program
  .name("beecargo")
  .description("Beecargo CLI — publish files and share links")
  .option("--key <apiKey>", "API key (or BEECARGO_API_KEY)")
  .option("--json", "Machine-readable JSON output");

program
  .command("upload")
  .argument("<path>", "Local file path")
  .option("--folder-id <id>", "Optional folder id")
  .option("--encrypt-age <recipient>", "Encrypt locally before upload (age recipient)")
  .option("--idempotency-key <key>", "Idempotency-Key for retries")
  .description("Upload a local file (auto multipart over 4MB)")
  .action(
    async (
      filePath: string,
      opts: {
        folderId?: string;
        encryptAge?: string;
        idempotencyKey?: string;
      },
    ) => {
      const root = program.opts<{ key?: string; json?: boolean }>();
      const apiKey = resolveApiKey(root.key);
      let path = filePath;
      let cleanup: (() => Promise<void>) | undefined;
      try {
        if (opts.encryptAge) {
          const enc = await encryptFileForAgeRecipient(filePath, opts.encryptAge);
          path = enc.path;
          cleanup = enc.cleanup;
        }
        await uploadLocalFileWithUi(path, {
          apiKey,
          folderId: opts.folderId,
          json: root.json,
          idempotencyKey: opts.idempotencyKey,
          clientEncryption: opts.encryptAge ? "age" : undefined,
        });
      } finally {
        if (cleanup) await cleanup();
      }
    },
  );

program
  .command("remote")
  .argument("<url>", "Public HTTPS URL to import")
  .option("--async", "Use background job + SSE progress")
  .option("--folder-id <id>", "Optional folder id")
  .description("Import a file from a public URL")
  .action(async (url: string, opts: { async?: boolean; folderId?: string }) => {
    const root = program.opts<{ key?: string; json?: boolean }>();
    const apiKey = resolveApiKey(root.key);
    await uploadRemoteUrlWithUi(url, {
      apiKey,
      async: opts.async,
      folderId: opts.folderId,
      json: root.json,
    });
  });

program
  .command("info")
  .argument("<fileId>", "File id")
  .description("Get file metadata")
  .action(async (fileId: string) => {
    const root = program.opts<{ key?: string; json?: boolean }>();
    await cmdInfo(fileId, {
      apiKey: resolveApiKey(root.key),
      json: root.json ?? true,
    });
  });

program
  .command("list")
  .option("--page <n>", "Page", "1")
  .option("--limit <n>", "Limit", "50")
  .description("List owned files")
  .action(async (opts: { page: string; limit: string }) => {
    const root = program.opts<{ key?: string; json?: boolean }>();
    await cmdList({
      apiKey: resolveApiKey(root.key),
      json: root.json ?? true,
      page: Number(opts.page),
      limit: Number(opts.limit),
    });
  });

program
  .command("delete")
  .argument("<fileId>", "File id")
  .option("--token <deletionToken>", "Anonymous deletion token")
  .option("--force", "Force delete immutable / dependent files")
  .description("Delete a file")
  .action(async (fileId: string, opts: { token?: string; force?: boolean }) => {
    const root = program.opts<{ key?: string; json?: boolean }>();
    await cmdDelete(fileId, {
      apiKey: resolveApiKey(root.key),
      token: opts.token,
      json: root.json,
      force: opts.force,
    });
  });

program
  .command("download")
  .argument("<fileId>", "File id")
  .argument("<dest>", "Local path to save")
  .option("--sha256 <hex>", "Verify digest after download")
  .description("Download via grant URL and optional sha256 verify")
  .action(async (fileId: string, dest: string, opts: { sha256?: string }) => {
    const root = program.opts<{ key?: string; json?: boolean }>();
    await cmdDownload(fileId, dest, {
      apiKey: resolveApiKey(root.key),
      sha256: opts.sha256,
      json: root.json,
    });
  });

program
  .command("watch")
  .argument("downloads")
  .argument("<fileId>", "File id")
  .description("Watch download events until a completed delivery")
  .action(async (_kind: string, fileId: string) => {
    const root = program.opts<{ key?: string; json?: boolean }>();
    await watchDownloads(fileId, {
      apiKey: resolveApiKey(root.key),
      json: root.json,
    });
  });

program
  .command("extend")
  .argument("<fileId>", "File id")
  .argument("<duration>", "Duration preset like 24h or 7d")
  .description("Extend file TTL additively")
  .action(async (fileId: string, duration: string) => {
    const root = program.opts<{ key?: string; json?: boolean }>();
    const res = await callApi({
      apiKey: resolveApiKey(root.key),
      method: "PATCH",
      path: "/files/share-settings",
      body: { fileId, extendTtl: duration },
    });
    if (!res.ok) {
      printError("Extend failed");
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(res.body, null, 2));
  });

program.parse();
