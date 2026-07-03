import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join, extname } from "node:path";
import { gzipSync, brotliCompressSync } from "node:zlib";
import { minifyText } from "./minify";

const COMPRESSIBLE_EXTS = new Set([".css", ".js", ".html", ".json", ".svg"]);

function walkDir(dir: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(full));
    } else if (entry.isFile() && COMPRESSIBLE_EXTS.has(extname(entry.name))) {
      files.push(full);
    }
  }

  return files;
}

function setupStaticDir(srcDir: string, destDir: string): void {
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  const entries = readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(srcDir, entry.name);
    const destPath = join(destDir, entry.name);

    if (entry.isDirectory()) {
      setupStaticDir(srcPath, destPath);
    } else if (entry.isFile()) {
      copyFileSync(srcPath, destPath);
    }
  }
}

function compressFile(filePath: string): void {
  const content = readFileSync(filePath, "utf8");
  const minimized = minifyText(content);

  const buf = Buffer.from(minimized, "utf8");

  const gz = gzipSync(buf);
  writeFileSync(`${filePath}.gz`, gz);

  const zst = (Bun.zstdCompressSync as (data: Buffer, opts?: object) => Buffer)(buf);
  writeFileSync(`${filePath}.zst`, zst);

  const br = brotliCompressSync(buf);
  writeFileSync(`${filePath}.br`, br);
}

export function compressAssets(
  srcDir: string,
  destDir: string,
): {
  total: number;
  compressed: number;
  originalBytes: number;
  compressedBytes: Record<string, number>;
} {
  if (!existsSync(destDir)) {
    setupStaticDir(srcDir, destDir);
  }

  const files = walkDir(destDir);
  let originalBytes = 0;
  const compressedBytes: Record<string, number> = { gz: 0, zst: 0, br: 0 };

  for (const file of files) {
    const stat = readFileSync(file);
    originalBytes += stat.length;
    compressFile(file);
    compressedBytes.gz += readFileSync(`${file}.gz`).length;
    compressedBytes.zst += readFileSync(`${file}.zst`).length;
    compressedBytes.br += readFileSync(`${file}.br`).length;
  }

  return { total: files.length, compressed: files.length, originalBytes, compressedBytes };
}
