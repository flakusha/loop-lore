/**
 * Build-time asset compressor.
 * Delegates to content/compress for actual compression logic.
 */

import { walkDirectory, compressFile, copyDirectory } from "../content/compress";
import { readFileSync, existsSync } from "node:fs";

// ── Main compression entry for build ─────────────────────────

function main() {
  const directory = process.argv[2] ?? "./dist/public";
  const sourcePublic = process.argv[3] ?? "./src/public";
  const sourceViews = process.argv[4] ?? "./src/views";

  if (!existsSync(directory)) {
    console.error(`Directory not found: ${directory}`);
    process.exit(1);
  }

  copyDirectory(sourcePublic, directory);
  copyDirectory(sourceViews, directory);

  const files = walkDirectory(directory);
  let total = 0;
  let originalBytes = 0;
  const compressedBytes: Record<string, number> = { gz: 0, zst: 0, br: 0 };

  for (const file of files) {
    const content = readFileSync(file);
    originalBytes += content.length;
    compressFile(file);
    compressedBytes.gz += readFileSync(`${file}.gz`, { encoding: null }).length;
    compressedBytes.zst += readFileSync(`${file}.zst`, { encoding: null }).length;
    compressedBytes.br += readFileSync(`${file}.br`, { encoding: null }).length;
    total++;
  }

  console.log(`Compressed ${total} files`);
  console.log(`Original: ${originalBytes} bytes`);
  console.log(`Compressed - gzip: ${compressedBytes.gz}, zstd: ${compressedBytes.zst}, brotli: ${compressedBytes.br}`);
}

main();