# Beecargo CLI

Terminal uploader with progress bars. Orchestrates direct upload (&lt;4MB) and client multipart automatically. Publish options match MCP/`POST /files/*` share fields.

## Install

```bash
# Preferred once published
npm install -g @beecargo/cli

# From this repo (builds on install)
npm install -g github:Beecargo/cli

# Or run without a global install
npx --yes github:Beecargo/cli --help
```

```bash
beecargo upload ./artifact.zip --json
```

## Setup

```bash
cd apps/cli && pnpm build
cp .env.example .env   # BEECARGO_API_URL, optional BEECARGO_API_KEY
```

From monorepo root: `pnpm cli upload ./artifact.zip` or `pnpm --filter @beecargo/cli dev remote https://example.com/file.bin --async`.

Auth resolution order: `--key` → `BEECARGO_API_KEY` → `~/.config/beecargo/config.json` (from `beecargo register --save`).

## Commands

| Command                                | Description                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| `beecargo upload <path>`               | Local file → share link (auto multipart over 4MB)                                     |
| `beecargo remote <url>`                | Sync import from public HTTPS URL                                                     |
| `beecargo remote <url> --async`        | Background job + SSE progress (poll fallback)                                         |
| `beecargo register [--save]`           | Mint bootstrap `bc_*` via challenge + PoW (optional config save)                      |
| `beecargo claim <fileId> <claimToken>` | Claim anonymous upload onto your key                                                  |
| `beecargo info <fileCode>`             | Metadata by share short code (`file_code`)                                            |
| `beecargo list`                        | List owned files (`--include-folders`, `--folder-id`)                                 |
| `beecargo folders list\|create`        | Folder management                                                                     |
| `beecargo delete <fileId>`             | Delete (`--token` for anonymous, `--force` when needed)                               |
| `beecargo download <fileId> <dest>`    | Unlock/purchase-aware download (`--unlock-code`, `--purchase-token`, `--sha256`)      |
| `beecargo watch downloads <fileId>`    | Watch download events until a completed delivery                                      |
| `beecargo share [fileId]`              | Update share settings (`--price-cents`, `--short-id`, `--protect`, `--visibility`, …) |
| `beecargo extend <fileId> <duration>`  | Extend TTL additively (`24h`, `7d`, …)                                                |

Global flags: `--key <bc_*>`, `--json`, `--version`.

### Publish flags (`upload` / `remote`)

Parity with MCP `beecargo_upload`:

| Flag                                              | Purpose                                                       |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `--ttl <preset>`                                  | Expiry preset (`1h`, `24h`, `7d`)                             |
| `--grace <value>`                                 | Grace after expiry                                            |
| `--max-downloads <n>` / `--once`                  | Burn / download cap                                           |
| `--protect`                                       | Mint unlock code (+ optional `--handoff-message`)             |
| `--visibility <unlisted\|public>`                 | Listing                                                       |
| `--direct`                                        | Pro: auto-start download on share page                        |
| `--retention <ttl\|forever>`                      | Public Pro retention                                          |
| `--expires-at <iso>`                              | Explicit expiry                                               |
| `--run-id` / `--step` / `--intent` / `--consumer` | Pipeline metadata                                             |
| `--open-share`                                    | Open a growable multi-file Shipment (then `--share-short-id`) |
| `--share-short-id <id>`                           | Attach to an existing growable Shipment                       |
| `--folder-id <id>`                                | Owned folder                                                  |
| `--encrypt-age <recipient>`                       | Local age encrypt before upload (`upload` only)               |
| `--idempotency-key <key>`                         | Safe retries (`upload` only)                                  |

Anonymous uploads work without `--key`; save `deletionToken` / `claimToken` when printed. Protected uploads also print `unlockCode` / `handoffUrl`.

`--json` emits a normalized receipt: `fileId`, `shortId`, `shareUrl` / `human_link`, `agent_link`, `sha256`, tokens, unlock fields.

## Smoke

```bash
BEECARGO_API_URL=http://localhost:3001 pnpm smoke:upload
```

## Docs

- MCP (agents): https://beecargo.net/docs/mcp/overview
- Agent corpus: https://beecargo.net/llms.txt
