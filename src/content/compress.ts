// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import fs from "node:fs";
import { extname, join, } from "node:path";
import { brotliCompressSync, gzipSync, } from "node:zlib";
import { safeFromString, } from "../utils/safe-buffer";
import { minifyCSS, minifyHTMLContent, minifyJS, minifyText, } from "./minify";

const COMPRESSIBLE_EXTS = new Set([".css", ".js", ".html", ".json", ".svg",],);

/**
 * @param sourceDir
 * @param destDir
 * @returns string
 */
export function copyDirectory(sourceDir: string, destDir: string,): void {
  if (!fs.existsSync(sourceDir,)) { return; }

  const sourceDirEntries = fs.readdirSync(sourceDir, { withFileTypes: true, },);
  for (const entry of sourceDirEntries) {
    const srcPath = join(sourceDir, entry.name,);
    const destPath = join(destDir, entry.name,);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath,);
    } else if (entry.isFile()) {
      fs.mkdirSync(join(destPath, "..",), { recursive: true, },);
      fs.copyFileSync(srcPath, destPath,);
    }
  }
}

/**
 * @param directory
 * @returns void
 */
export function walkDirectory(directory: string,): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(directory, { withFileTypes: true, },);

  for (const entry of entries) {
    const full = join(directory, entry.name,);
    if (entry.isDirectory()) {
      files.push(...walkDirectory(full,),);
    } else if (entry.isFile() && COMPRESSIBLE_EXTS.has(extname(entry.name,),)) {
      files.push(full,);
    }
  }

  return files;
}

/**
 * @param sourceDirectory
 * @param destinationDirectory
 * @returns void
 */
function _setupStaticDirectory(sourceDirectory: string, destinationDirectory: string,): void {
  if (!fs.existsSync(destinationDirectory,)) {
    fs.mkdirSync(destinationDirectory, { recursive: true, },);
  }

  const entries = fs.readdirSync(sourceDirectory, { withFileTypes: true, },);

  for (const entry of entries) {
    const sourcePath = join(sourceDirectory, entry.name,);
    const destinationPath = join(destinationDirectory, entry.name,);

    if (entry.isDirectory()) {
      _setupStaticDirectory(sourcePath, destinationPath,);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, destinationPath,);
    }
  }
}

/**
 * @param content
 * @param extension
 * @returns void
 */
async function _getMinimizedContent(content: string, extension: string,): Promise<string> {
  switch (extension) {
    case ".css": {
      return minifyCSS(content,);
    }

    case ".js": {
      return minifyJS(content,);
    }

    case ".html":
    case ".htm": {
      return minifyHTMLContent(content,);
    }

    default: {
      return minifyText(content,);
    }
  }
}

/**
 * @param filePath
 * @throws {Error}
 * @returns {Promise<void>}
 */
export async function compressFile(filePath: string,): Promise<void> {
  const content = fs.readFileSync(filePath, "utf8",);
  const extension = extname(filePath,);
  const minimized = await _getMinimizedContent(content, extension,);

  const bufResult = safeFromString(minimized, "utf8",);
  if (!bufResult.ok) { throw bufResult.error; }
  const buffer = bufResult.buffer;

  if (minimized.length < content.length) {
    fs.writeFileSync(filePath, minimized, "utf8",);
  }

  const gz = gzipSync(buffer,);
  fs.writeFileSync(`${filePath}.gz`, gz,);

  // zstd compression via Bun runtime (type-safe wrapper)
  const bun = Bun as { zstdCompressSync?: (data: Buffer,) => Buffer };
  const zstdFn = bun.zstdCompressSync;
  if (zstdFn) {
    fs.writeFileSync(`${filePath}.zst`, zstdFn(buffer,),);
  }

  const br = brotliCompressSync(buffer,);
  fs.writeFileSync(`${filePath}.br`, br,);
}

/**
 * @param sourceDirectory
 * @param destinationDirectory
 * @returns {Promise<{ total: number; compressed: number; originalBytes: number; compressedBytes: Record<string, number>; }>}
 */
export async function compressAssets(
  sourceDirectory: string,
  destinationDirectory: string,
): Promise<{
  total: number;
  compressed: number;
  originalBytes: number;
  compressedBytes: Record<string, number>;
}> {
  if (!fs.existsSync(destinationDirectory,)) {
    _setupStaticDirectory(sourceDirectory, destinationDirectory,);
  }

  const files = walkDirectory(destinationDirectory,);
  let originalBytes = 0;
  const compressedBytes: Record<"gz" | "zst" | "br", number> = { gz: 0, zst: 0, br: 0, };
  const bun = Bun as { zstdCompressSync?: (data: Buffer,) => Buffer };
  const zstdFn = bun.zstdCompressSync;

  for (const file of files) {
    const stat = fs.readFileSync(file,);
    originalBytes += stat.length;
    await compressFile(file,);
    compressedBytes.gz += fs.readFileSync(`${file}.gz`, { encoding: null, },).length;
    if (zstdFn) {
      compressedBytes.zst += fs.readFileSync(`${file}.zst`, { encoding: null, },).length;
    }

    compressedBytes.br += fs.readFileSync(`${file}.br`, { encoding: null, },).length;
  }

  return { total: files.length, compressed: files.length, originalBytes, compressedBytes, };
}
