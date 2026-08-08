import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as age from "age-encryption";

/**
 * Stream-encrypt a local file with age (X25519 recipient).
 * Private keys are never logged. Output is opaque ciphertext for upload.
 */
export async function encryptFileForAgeRecipient(
  inputPath: string,
  recipient: string,
): Promise<{ path: string; cleanup: () => Promise<void>; contentType: string }> {
  const trimmed = recipient.trim();
  if (!trimmed.startsWith("age1")) {
    throw new Error("Recipient must be an age public key (age1…)");
  }
  // Never echo secrets from env accidentally passed as recipient.
  if (trimmed.toUpperCase().includes("AGE-SECRET-KEY")) {
    throw new Error("Pass a recipient (age1…), not a private identity");
  }

  const dir = await mkdtemp(join(tmpdir(), "beecargo-age-"));
  const outPath = join(dir, `${basename(inputPath)}.age`);
  const encrypter = new age.Encrypter();
  encrypter.addRecipient(trimmed);

  const nodeStream = createReadStream(inputPath);
  const webIn = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
  const encrypted = await encrypter.encrypt(webIn);
  const webOut = encrypted as ReadableStream<Uint8Array>;
  await pipeline(Readable.fromWeb(webOut as never), createWriteStream(outPath));

  const size = (await stat(outPath)).size;
  if (size <= 0) {
    throw new Error("Encryption produced an empty file");
  }

  return {
    path: outPath,
    contentType: "application/octet-stream",
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}
