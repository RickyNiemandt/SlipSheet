#!/usr/bin/env tsx
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { parseDocument } from "@slipsheet/parse";

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

async function main() {
  const fixturePath = process.argv[2];
  if (!fixturePath) {
    console.error("Usage: npm run parse -- <fixture-path>");
    process.exit(1);
  }

  const ext = extname(fixturePath).toLowerCase();
  const mimeType = MIME_BY_EXT[ext];
  if (!mimeType) {
    console.error(`Unsupported extension: ${ext}`);
    process.exit(1);
  }

  const bytes = new Uint8Array(await readFile(fixturePath));
  const receipt = await parseDocument({
    bytes,
    mimeType,
    filename: basename(fixturePath),
  });

  console.log(JSON.stringify(receipt, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
