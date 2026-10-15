// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { existsSync, } from "node:fs";

const MIME_TYPES: Record<string, string> = {
  html: "text/html",
  css: "text/css",
  js: "application/javascript",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  woff2: "font/woff2",
  gz: "application/gzip",
  br: "application/brotli",
  zst: "application/zstd",
  wasm: "application/wasm",
};

/**
 * @param filePath - file path or URL
 * @returns MIME type string (`text/plain` for unknown extensions).
 */
export function getContentType(filePath: string,): string {
  const extension = filePath.split(".",).pop()?.toLowerCase() ?? "";
  return MIME_TYPES[extension] ?? "text/plain";
}

const COMPRESSIBLE_EXTS = new Set([".css", ".js", ".html", ".json", ".svg", ".wasm",],);

/**
 * @param filePath - file path
 * @returns `true` when the file's extension is in the compressible set (css/js/html/json/svg/wasm).
 */
function isCompressible(filePath: string,): boolean {
  const extension = filePath.split(".",).pop()?.toLowerCase();
  return extension ? COMPRESSIBLE_EXTS.has(`.${extension}`,) : false;
}

/**
 * @param filePath - base file path
 * @param acceptEncoding - HTTP `Accept-Encoding` header value
 * @returns `{ path, encoding }` for the best matching pre-compressed variant (prefers `br` > `zstd` > `gzip`), or `null` when the file is not compressible or no variant is available.
 */
export function findCompressedVariant(
  filePath: string,
  acceptEncoding: string,
): { path: string; encoding: string } | null {
  if (!isCompressible(filePath,)) { return null; }

  const encodings = new Set<string>();
  // RFC 9110 §12.5.3: each coding may carry `;q=` (or any `;token=`)
  // parameters — strip them so "gzip;q=0.5" still matches "gzip".
  for (const encoding of acceptEncoding.split(",",)) {
    const token = encoding.split(";",)[0] ?? "";
    encodings.add(token.trim().toLowerCase(),);
  }

  if (encodings.has("br",) && existsSync(`${filePath}.br`,)) {
    return { path: `${filePath}.br`, encoding: "br", };
  }

  if (encodings.has("zstd",) && existsSync(`${filePath}.zst`,)) {
    return { path: `${filePath}.zst`, encoding: "zstd", };
  }

  if (encodings.has("gzip",) && existsSync(`${filePath}.gz`,)) {
    return { path: `${filePath}.gz`, encoding: "gzip", };
  }

  return null;
}
