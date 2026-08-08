# Beecargo CLI

Terminal uploader with progress bars. Orchestrates direct upload (&lt;4MB) and client multipart automatically.

## Setup

```bash
cd apps/cli && pnpm build
cp .env.example .env   # BEECARGO_API_URL, optional BEECARGO_API_KEY
```

From repo root: `pnpm cli upload ./artifact.zip` or `pnpm --filter @beecargo/cli dev remote https://example.com/file.bin --async`.

## Commands

| Command                         | Description                                   |
| ------------------------------- | --------------------------------------------- |
| `beecargo upload <path>`        | Local file → share link                       |
| `beecargo remote <url>`         | Sync import from public HTTPS URL             |
| `beecargo remote <url> --async` | Background job + SSE progress (poll fallback) |

Anonymous uploads work without `--key`; save `deletionToken` from output when printed.

## Smoke

```bash
BEECARGO_API_URL=http://localhost:3001 pnpm smoke:upload
```
