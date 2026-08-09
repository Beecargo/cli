#!/usr/bin/env node
import { Command } from "commander";
import { cmdDelete, cmdDownload, cmdInfo, cmdList } from "./agent-commands.js";
import { encryptFileForAgeRecipient } from "./age-encrypt.js";
import { resolveApiKeyAsync } from "./env.js";
import {
  cmdClaim,
  cmdFolderCreate,
  cmdFolderList,
  cmdRegister,
  cmdShare,
} from "./ownership-commands.js";
import { CLI_VERSION } from "./package-meta.js";
import { addPublishFlags } from "./publish-flags.js";
import { publishOptionsFromFlags, type PublishCliFlags } from "./publish-options.js";
import { uploadLocalFileWithUi } from "./upload-local.js";
import { uploadRemoteUrlWithUi } from "./upload-remote.js";
import { watchDownloads } from "./watch-downloads.js";
import { printError } from "./tui.js";

const program = new Command();

program
  .name("beecargo")
  .description("Beecargo CLI — publish files and share links")
  .version(CLI_VERSION)
  .option("--key <apiKey>", "API key (or BEECARGO_API_KEY / saved config)")
  .option("--json", "Machine-readable JSON output");

addPublishFlags(
  program
    .command("upload")
    .argument("<path>", "Local file path")
    .option("--folder-id <id>", "Optional folder id")
    .option(
      "--encrypt-age <recipient>",
      "Encrypt locally before upload (age recipient)",
    )
    .option("--idempotency-key <key>", "Idempotency-Key for retries")
    .description("Upload a local file (auto multipart over 4MB)"),
).action(
  async (
    filePath: string,
    opts: PublishCliFlags & {
      folderId?: string;
      encryptAge?: string;
      idempotencyKey?: string;
    },
  ) => {
    const root = program.opts<{ key?: string; json?: boolean }>();
    const apiKey = await resolveApiKeyAsync(root.key);
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
        publish: publishOptionsFromFlags(opts),
      });
    } finally {
      if (cleanup) await cleanup();
    }
  },
);

addPublishFlags(
  program
    .command("remote")
    .argument("<url>", "Public HTTPS URL to import")
    .option("--async", "Use background job + SSE progress")
    .option("--folder-id <id>", "Optional folder id")
    .description("Import a file from a public URL"),
).action(
  async (
    url: string,
    opts: PublishCliFlags & { async?: boolean; folderId?: string },
  ) => {
    const root = program.opts<{ key?: string; json?: boolean }>();
    const apiKey = await resolveApiKeyAsync(root.key);
    await uploadRemoteUrlWithUi(url, {
      apiKey,
      async: opts.async,
      folderId: opts.folderId,
      json: root.json,
      publish: publishOptionsFromFlags(opts),
    });
  },
);

program
  .command("register")
  .option("--label <label>", "Key label", "cli-agent")
  .option("--save", "Store key in ~/.config/beecargo/config.json")
  .description("Mint a bootstrap bc_* API key")
  .action(async (opts: { label?: string; save?: boolean }) => {
    const root = program.opts<{ json?: boolean }>();
    await cmdRegister({
      label: opts.label,
      save: opts.save,
      json: root.json,
    });
  });

program
  .command("claim")
  .argument("<fileId>", "File id from upload")
  .argument("<claimToken>", "claimToken from upload")
  .description("Claim an anonymous upload onto your API key")
  .action(async (fileId: string, claimToken: string) => {
    const root = program.opts<{ key?: string; json?: boolean }>();
    await cmdClaim(fileId, claimToken, {
      apiKey: await resolveApiKeyAsync(root.key),
      json: root.json,
    });
  });

program
  .command("info")
  .argument("<fileCode>", "Share short code(s), comma-separated")
  .description("Get file metadata by short code (file_code)")
  .action(async (fileCode: string) => {
    const root = program.opts<{ key?: string; json?: boolean }>();
    await cmdInfo(fileCode, {
      apiKey: await resolveApiKeyAsync(root.key),
      json: root.json ?? true,
    });
  });

program
  .command("list")
  .option("--page <n>", "Page", "1")
  .option("--limit <n>", "Limit", "50")
  .option("--folder-id <id>", "Filter by folder")
  .option("--include-folders", "Include sibling folders in the response")
  .description("List owned files")
  .action(
    async (opts: {
      page: string;
      limit: string;
      folderId?: string;
      includeFolders?: boolean;
    }) => {
      const root = program.opts<{ key?: string; json?: boolean }>();
      await cmdList({
        apiKey: await resolveApiKeyAsync(root.key),
        json: root.json ?? true,
        page: Number(opts.page),
        limit: Number(opts.limit),
        folderId: opts.folderId,
        includeFolders: opts.includeFolders,
      });
    },
  );

const folders = program.command("folders").description("Manage folders");

folders
  .command("list")
  .option("--page <n>", "Page", "1")
  .option("--limit <n>", "Limit", "50")
  .option("--parent-id <id>", "Parent folder id")
  .description("List folders")
  .action(
    async (opts: { page: string; limit: string; parentId?: string }) => {
      const root = program.opts<{ key?: string; json?: boolean }>();
      await cmdFolderList({
        apiKey: await resolveApiKeyAsync(root.key),
        page: Number(opts.page),
        limit: Number(opts.limit),
        parentId: opts.parentId,
        json: root.json,
      });
    },
  );

folders
  .command("create")
  .argument("<name>", "Folder name")
  .option("--parent-id <id>", "Parent folder id")
  .description("Create a folder")
  .action(async (name: string, opts: { parentId?: string }) => {
    const root = program.opts<{ key?: string; json?: boolean }>();
    await cmdFolderCreate(name, {
      apiKey: await resolveApiKeyAsync(root.key),
      parentId: opts.parentId,
      json: root.json,
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
      apiKey: await resolveApiKeyAsync(root.key),
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
  .option("--unlock-code <code>", "Unlock code for protected shares")
  .option("--unlock-token <token>", "Unlock token for protected shares")
  .option("--handoff-token <token>", "Handoff token from /h/… delivery link")
  .option(
    "--purchase-token <token>",
    "Token from paid-share claim (POST /purchases/claim)",
  )
  .description("Download via signed URL (unlock-aware) and optional sha256 verify")
  .action(
    async (
      fileId: string,
      dest: string,
      opts: {
        sha256?: string;
        unlockCode?: string;
        unlockToken?: string;
        handoffToken?: string;
        purchaseToken?: string;
      },
    ) => {
      const root = program.opts<{ key?: string; json?: boolean }>();
      await cmdDownload(fileId, dest, {
        apiKey: await resolveApiKeyAsync(root.key),
        sha256: opts.sha256,
        unlockCode: opts.unlockCode,
        unlockToken: opts.unlockToken,
        handoffToken: opts.handoffToken,
        purchaseToken: opts.purchaseToken,
        json: root.json,
      });
    },
  );

program
  .command("watch")
  .argument("downloads")
  .argument("<fileId>", "File id")
  .description("Watch download events until a completed delivery")
  .action(async (_kind: string, fileId: string) => {
    const root = program.opts<{ key?: string; json?: boolean }>();
    await watchDownloads(fileId, {
      apiKey: await resolveApiKeyAsync(root.key),
      json: root.json,
    });
  });

program
  .command("share")
  .argument("[fileId]", "File id (or pass --short-id for a Shipment)")
  .option("--short-id <id>", "Shipment / share shortId (alternative to fileId)")
  .option("--visibility <mode>", "unlisted | public")
  .option(
    "--price-cents <n>",
    "One-time USD price in cents (min 100; 0 clears). Requires Connect readyToSell",
  )
  .option("--direct", "Pro: start download when share page opens")
  .option("--no-direct", "Disable direct download")
  .option("--retention <mode>", "ttl | forever")
  .option("--expires-at <iso>", "Explicit expiry ISO timestamp")
  .option("--extend-ttl <preset>", "Additive TTL preset like 24h or 7d")
  .option("--protect", "Mint unlock code (+ optional handoff)")
  .option("--no-protect", "Clear link protection")
  .option("--handoff-message <text>", "Note on /h/… delivery link")
  .description("Update share settings on an owned file or Shipment")
  .action(
    async (
      fileId: string | undefined,
      opts: {
        shortId?: string;
        visibility?: string;
        priceCents?: string;
        direct?: boolean;
        retention?: string;
        expiresAt?: string;
        extendTtl?: string;
        protect?: boolean;
        handoffMessage?: string;
      },
    ) => {
      const root = program.opts<{ key?: string; json?: boolean }>();
      if (!fileId && !opts.shortId) {
        printError("Pass fileId and/or --short-id");
        process.exitCode = 1;
        return;
      }
      const body: Record<string, unknown> = {};
      if (opts.shortId !== undefined) body.shortId = opts.shortId;
      if (opts.visibility !== undefined) body.visibility = opts.visibility;
      if (opts.priceCents !== undefined) {
        const n = Number(opts.priceCents);
        if (!Number.isInteger(n) || n < 0) {
          printError("--price-cents must be a non-negative integer (0 clears)");
          process.exitCode = 1;
          return;
        }
        body.priceCents = n;
      }
      if (opts.direct !== undefined) body.direct = opts.direct;
      if (opts.retention !== undefined) body.retention = opts.retention;
      if (opts.expiresAt !== undefined) body.expiresAt = opts.expiresAt;
      if (opts.extendTtl !== undefined) body.extendTtl = opts.extendTtl;
      if (opts.protect !== undefined) body.protect = opts.protect;
      if (opts.handoffMessage !== undefined) {
        body.handoffMessage = opts.handoffMessage;
      }
      const settingKeys = Object.keys(body).filter((k) => k !== "shortId");
      if (settingKeys.length === 0) {
        printError(
          "Pass at least one share flag (--visibility, --price-cents, --protect, …)",
        );
        process.exitCode = 1;
        return;
      }
      await cmdShare(fileId, body, {
        apiKey: await resolveApiKeyAsync(root.key),
        json: root.json,
      });
    },
  );

program
  .command("extend")
  .argument("<fileId>", "File id")
  .argument("<duration>", "Duration preset like 24h or 7d")
  .description("Extend file TTL additively (alias of share --extend-ttl)")
  .action(async (fileId: string, duration: string) => {
    const root = program.opts<{ key?: string; json?: boolean }>();
    await cmdShare(
      fileId,
      { extendTtl: duration },
      {
        apiKey: await resolveApiKeyAsync(root.key),
        json: root.json ?? true,
      },
    );
  });

program.parse();
