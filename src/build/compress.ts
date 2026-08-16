// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { existsSync, readFileSync, writeFileSync, } from "node:fs";
import { extname, join, } from "node:path";
import { compressFile, copyDirectory, walkDirectory, } from "../content/compress";
import { injectContentHashes, } from "../content/hash-injection";
import { minifyCSS, minifyHTMLContent, } from "../content/minify";
import { createLogger, } from "../logger";
import type { Logger, } from "../logger/types";

const STRIP_TEST_IDS = process.env.STRIP_TEST_IDS !== "false";

function stripTestIds(content: string,): string {
  let result = content.replaceAll(/\s+data-testid="[^"]*"/g, "",);
  result = result.replaceAll(/\s+:data-testid="[^"]*"/g, "",);
  return result;
}

async function main() {
  const log = createLogger({ level: "info", },);
  const directory = process.argv[2] ?? "./dist/public";
  const sourcePublic = process.argv[3] ?? "./src/public";
  const sourceViews = process.argv[4] ?? "./src/views";
  const sourceComponents = process.argv[5] ?? "./src/components";

  if (!existsSync(directory,)) {
    log.fatal(`Directory not found: ${directory}`,);
    process.exit(1,);
  }

  copyDirectory(sourcePublic, directory,);
  copyDirectory(sourceViews, directory,);
  copyDirectory(sourceComponents, join(directory, "components",),);

  const hashResult = injectContentHashes(directory,);
  if (hashResult.replaced > 0) {
    log.info(`Hash-injected ${hashResult.replaced} references (${hashResult.skipped} skipped)`,);
  }

  const files = walkDirectory(directory,);
  let total = 0;
  let originalBytes = 0;
  const compressedBytes: Record<"gz" | "zst" | "br", number> = { gz: 0, zst: 0, br: 0, };

  for (const file of files) {
    const content = readFileSync(file,);
    originalBytes += content.length;

    await minifyByExtension(file, content, log,);

    try {
      await compressFile(file,);
      compressedBytes.gz += readFileSync(`${file}.gz`, { encoding: null, },).length;
      compressedBytes.zst += readFileSync(`${file}.zst`, { encoding: null, },).length;
      compressedBytes.br += readFileSync(`${file}.br`, { encoding: null, },).length;
      total++;
    } catch (error) {
      log.error(`Compression failed on ${file}`, error instanceof Error ? error : new Error(String(error,),),);
    }
  }

  let totalAfter = 0;
  for (const f of files) { totalAfter += readFileSync(f,).length; }

  log.info(`Compressed ${total} files`,);
  log.info(`Original: ${originalBytes} bytes`,);
  if (totalAfter < originalBytes) {
    const pct = (((originalBytes - totalAfter) / originalBytes) * 100).toFixed(1,);
    const why = STRIP_TEST_IDS ? "minification + data-testid strip" : "minification";
    log.info(`After ${why}: ${totalAfter} bytes (${pct}% savings)`,);
  }
  log.info(
    `Compressed sizes - gzip: ${compressedBytes.gz}, zstd: ${compressedBytes.zst}, brotli: ${compressedBytes.br}`,
  );
}

/**
 * Minify a build artifact in place by extension (CSS / HTML / SVG).
 *
 * Writes the minified form only when it is strictly smaller than the source.
 * Minification failures are logged and the original file is left untouched.
 *
 * @param file - Absolute path of the artifact
 * @param content - Current file bytes
 * @param log - Logger for minification failures
 */
async function minifyByExtension(file: string, content: Buffer, log: Logger,): Promise<void> {
  const ext = extname(file,).toLowerCase();
  if (ext === ".css") { minifyCss(file, content, log,); }
  if (ext === ".html" || ext === ".htm") { await minifyHtml(file, content, log,); }
  if (ext === ".svg") { stripSvgTestIds(file, content,); }
}

/** Minify a CSS artifact in place when the result is smaller. */
function minifyCss(file: string, content: Buffer, log: Logger,): void {
  const original = content.toString("utf8",);
  try {
    const minified = minifyCSS(original,);
    if (minified.length < original.length) {
      writeFileSync(file, minified, "utf8",);
    }
  } catch (writeError) {
    log.error(
      `Failed to minify CSS at ${file}`,
      writeError instanceof Error ? writeError : new Error(String(writeError,),),
    );
  }
}

/** Minify an HTML artifact in place when the result is smaller. */
async function minifyHtml(file: string, content: Buffer, log: Logger,): Promise<void> {
  const original = content.toString("utf8",);
  try {
    let processed = await minifyHTMLContent(original,);
    if (STRIP_TEST_IDS) {
      processed = stripTestIds(processed,);
    }
    if (processed.length < original.length) {
      writeFileSync(file, processed, "utf8",);
    }
  } catch (writeError) {
    log.error(
      `Failed to minify HTML at ${file}`,
      writeError instanceof Error ? writeError : new Error(String(writeError,),),
    );
  }
}

/** Strip `data-testid` attributes from an SVG artifact in place when smaller. */
function stripSvgTestIds(file: string, content: Buffer,): void {
  let processed = content.toString("utf8",);
  if (STRIP_TEST_IDS) {
    processed = stripTestIds(processed,);
  }
  if (processed.length < content.length) {
    writeFileSync(file, processed, "utf8",);
  }
}

await main();
