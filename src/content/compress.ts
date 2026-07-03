import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join, extname } from "node:path";
import { gzipSync, brotliCompressSync } from "node:zlib";
import { minifyText } from "./minify";

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

function _setupStaticDirectory(sourceDirectory: string, destinationDirectory: string): void {
  if (!existsSync(destinationDirectory)) {
    mkdirSync(destinationDirectory, { recursive: true });
  }

  const entries = readdirSync(sourceDirectory, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = join(sourceDirectory, entry.name);
    const destinationPath = join(destinationDirectory, entry.name);

    if (entry.isDirectory()) {
      _setupStaticDirectory(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      copyFileSync(sourcePath, destinationPath);
    }
  }
}

function compressFile(filePath: string): void {
  const content = readFileSync(filePath, "utf8");
  const minimized = minifyText(content);

  const buffer = Buffer.from(minimized, "utf8");

  const gz = gzipSync(buffer);
  writeFileSync(`${filePath}.gz`, gz);

  const zst = (Bun.zstdCompressSync as (data: Buffer, options?: object) => Buffer)(buffer);
  writeFileSync(`${filePath}.zst`, zst);

  const br = brotliCompressSync(buffer);
  writeFileSync(`${filePath}.br`, br);
}

export function compressAssets(
  sourceDirectory: string,
  destinationDirectory: string,
): {
  total: number;
  compressed: number;
  originalBytes: number;
  compressedBytes: Record<string, number>;
} {
  if (!existsSync(destinationDirectory)) {
    _setupStaticDirectory(sourceDirectory, destinationDirectory);
  }

  const files = walkDirectory(destinationDirectory);
  let originalBytes = 0;
  const compressedBytes: Record<string, number> = { gz: 0, zst: 0, br: 0 };

  for (const file of files) {
    const stat = readFileSync(file);
    originalBytes += stat.length;
    compressFile(file);
    compressedBytes.gz += readFileSync(`${file}.gz`, { encoding: null }).length;
    compressedBytes.zst += readFileSync(`${file}.zst`, { encoding: null }).length;
    compressedBytes.br += readFileSync(`${file}.br`, { encoding: null }).length;
  }

  return { total: files.length, compressed: files.length, originalBytes, compressedBytes };
}
