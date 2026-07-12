import { walkDirectory, compressFile, copyDirectory } from "../content/compress";
import { injectContentHashes } from "../content/hash-injection";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { createLogger } from "../logger";

const HTML_COMMENT_EXTS = new Set([".html", ".htm", ".svg"]);
const STRIP_TEST_IDS = process.env.STRIP_TEST_IDS !== "false";

function stripHtmlComments(content: string): string {
  return content.replaceAll(/<!--[\s\S]*?-->/g, "");
}

function stripTestIds(content: string): string {
  let result = content.replaceAll(/\s+data-testid="[^"]*"/g, "");
  result = result.replaceAll(/\s+:data-testid="[^"]*"/g, "");
  return result;
}

async function main() {
  const log = createLogger({ level: "info" });
  const directory = process.argv[2] ?? "./dist/public";
  const sourcePublic = process.argv[3] ?? "./src/public";
  const sourceViews = process.argv[4] ?? "./src/views";
  const sourceComponents = process.argv[5] ?? "./src/components";

  if (!existsSync(directory)) {
    log.error(`Directory not found: ${directory}`);
    process.exit(1);
  }

  copyDirectory(sourcePublic, directory);
  copyDirectory(sourceViews, directory);
  copyDirectory(sourceComponents, join(directory, "components"));

  const hashResult = injectContentHashes(directory);
  if (hashResult.replaced > 0) {
    log.info(`Hash-injected ${hashResult.replaced} references (${hashResult.skipped} skipped)`);
  }

  const files = walkDirectory(directory);
  let total = 0;
  let originalBytes = 0;
  const compressedBytes: Record<"gz" | "zst" | "br", number> = { gz: 0, zst: 0, br: 0 };

  for (const file of files) {
    const content = readFileSync(file);
    originalBytes += content.length;

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
      await compressFile(file);
      compressedBytes.gz += readFileSync(`${file}.gz`, { encoding: null }).length;
      compressedBytes.zst += readFileSync(`${file}.zst`, { encoding: null }).length;
      compressedBytes.br += readFileSync(`${file}.br`, { encoding: null }).length;
      total++;
    } catch (error) {
      log.error(`Compression failed on ${file}`, error instanceof Error ? error : new Error(String(error)));
    }
  }

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

await main();
