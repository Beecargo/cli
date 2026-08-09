import type { Command } from "commander";

/** Attach MCP-parity publish flags to an upload/remote command. */
export const addPublishFlags = (command: Command): Command =>
  command
    .option("--visibility <mode>", "unlisted | public")
    .option("--direct", "Pro: start download when share page opens")
    .option("--retention <mode>", "ttl | forever (public Pro)")
    .option("--expires-at <iso>", "Explicit expiry ISO timestamp")
    .option("--ttl <preset>", "Expiry preset: 1h, 24h, 7d")
    .option("--grace <value>", "Grace after expiry (seconds or duration)")
    .option("--max-downloads <n>", "Cap successful downloads")
    .option("--once", "Burn after one successful download")
    .option("--protect", "Mint unlock code (+ optional handoff)")
    .option("--handoff-message <text>", "Note on /h/… delivery link")
    .option("--run-id <id>", "Pipeline run id")
    .option("--step <step>", "Pipeline step label")
    .option("--intent <intent>", "Publish intent label")
    .option("--consumer <name>", "Downstream consumer label")
    .option(
      "--open-share",
      "Open a growable multi-file Shipment (pass --share-short-id later)",
    )
    .option(
      "--share-short-id <code>",
      "Attach to an existing growable Shipment shortId",
    );
