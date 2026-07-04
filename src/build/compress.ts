import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join, extname } from "node:path";
import { gzipSync, brotliCompressSync } from "node:zlib";
import { minifyText, minifyCSS } from "../content/minify";

const COMPRESSIBLE_EXTS = new Set([".css", ".js", ".html", ".json", ".svg"]);

function walkDirectory(directory: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDirectory(full));
    } else if (entry.isFile() && COMPRESSIBLE_EXTS.has(extname(entry.name))) {
      files.push(full);
    }
  }

  return files;
}

function compressFile(filePath: string): void {
  const content = readFileSync(filePath, "utf8");
  const extension = extname(filePath);
  const minimized = extension === ".css" ? minifyCSS(content) : minifyText(content);

  const buffer = Buffer.from(minimized, "utf8");

  const gz = gzipSync(buffer);
  writeFileSync(`${filePath}.gz`, gz);

  const zst = (Bun.zstdCompressSync as (data: Buffer, options?: object) => Buffer)(buffer);
  writeFileSync(`${filePath}.zst`, zst);

  const br = brotliCompressSync(buffer);
  writeFileSync(`${filePath}.br`, br);
}

function copyDirectory(sourceDir: string, destDir: string): void {
  if (!existsSync(sourceDir)) return;
  
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const srcPath = join(sourceDir, entry.name);
    const destPath = join(destDir, entry.name);
    
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else if (entry.isFile()) {
      mkdirSync(join(destPath, ".."), { recursive: true });
      copyFileSync(srcPath, destPath);
    }
  }
}

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