/**
 * Build-time asset compressor.
 * Delegates to content/compress for actual compression logic.
 * Strips HTML comments + data-testid from view templates before compression.
 * Set STRIP_TEST_IDS=false env to preserve test IDs (e.g. for testing built output).
 */

import { walkDirectory, compressFile, copyDirectory } from "../content/compress";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { extname } from "node:path";
import { createLogger } from "../logger";

// ── Strip HTML comments (<!-- ... -->) from HTML files ────

function stripHtmlComments(content: string): string {
  return content.replaceAll(/<!--[\s\S]*?-->/g, "");
}

/** Strip data-testid="..." attributes (and :data-testid="..." Alpine dynamic) */
function stripTestIds(content: string): string {
  // eslint-disable-next-line sonarjs/super-linear-regex
  let result = content.replaceAll(/\s+data-testid="[^"]*"/g, "");
  // eslint-disable-next-line sonarjs/super-linear-regex
  result = result.replaceAll(/\s+:data-testid="[^"]*"/g, "");
  return result;
}

const HTML_COMMENT_EXTS = new Set([".html", ".htm", ".svg"]);
const STRIP_TEST_IDS = process.env.STRIP_TEST_IDS !== "false";

// ── Main compression entry for build ─────────────────────────

function main() {
  const log = createLogger({ level: "info" });
  const directory = process.argv[2] ?? "./dist/public";
  const sourcePublic = process.argv[3] ?? "./src/public";
  const sourceViews = process.argv[4] ?? "./src/views";

  if (!existsSync(directory)) {
    log.error(`Directory not found: ${directory}`);
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

    // Strip HTML comments + data-testid from HTML/SVG before compression
    if (HTML_COMMENT_EXTS.has(extname(file).toLowerCase())) {
      let processed = content.toString("utf8");
      processed = stripHtmlComments(processed);
      if (STRIP_TEST_IDS) {
        processed = stripTestIds(processed);
      }
      if (processed.length < content.length) {
        writeFileSync(file, processed, "utf8");
      }
    }

    try {
      compressFile(file);
      compressedBytes.gz += readFileSync(`${file}.gz`, { encoding: null }).length;
      compressedBytes.zst += readFileSync(`${file}.zst`, { encoding: null }).length;
      compressedBytes.br += readFileSync(`${file}.br`, { encoding: null }).length;
      total++;
    } catch (error) {
      log.error(`Compression failed on ${file}`, error instanceof Error ? error : new Error(String(error)));
    }
  }

  // Print savings from stripping
  const totalAfter = files.reduce((sum, f) => sum + readFileSync(f).length, 0);

  log.info(`Compressed ${total} files`);
  log.info(`Original: ${originalBytes} bytes`);
  if (totalAfter < originalBytes) {
    const pct = (((originalBytes - totalAfter) / originalBytes) * 100).toFixed(1);
    const why = STRIP_TEST_IDS ? "HTML comments + data-testid" : "HTML comments";
    log.info(`After ${why} strip: ${totalAfter} bytes (${pct}% savings)`);
  }
  log.info(
    `Compressed sizes - gzip: ${compressedBytes.gz}, zstd: ${compressedBytes.zst}, brotli: ${compressedBytes.br}`,
  );
}

main();
