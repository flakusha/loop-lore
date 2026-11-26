// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { existsSync, } from "node:fs";
import { parseAcceptEncoding, } from "../transport/negotiation-parsers";

const MIME_TYPES: Record<string, string> = {
  html: "text/html",
  css: "text/css",
  js: "application/javascript",
  json: "application/json",
  webmanifest: "application/manifest+json",
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
export function isCompressible(filePath: string,): boolean {
  const extension = filePath.split(".",).pop()?.toLowerCase();
  return extension ? COMPRESSIBLE_EXTS.has(`.${extension}`,) : false;
}

const VARIANT_SUFFIXES: Record<string, string> = {
  br: ".br",
  zstd: ".zst",
  gzip: ".gz",
};

// Legacy preference for codings carrying the same q-value.
const CODING_PRIORITY = ["br", "zstd", "gzip",];

/**
 * @param filePath - base file path
 * @param acceptEncoding - HTTP `Accept-Encoding` header value
 * @returns `{ path, encoding }` for the highest-q acceptable variant on disk, or `null`. Equal q keeps `br` > `zstd` > `gzip`.
 */
export function findCompressedVariant(
  filePath: string,
  acceptEncoding: string,
): { path: string; encoding: string } | null {
  if (!isCompressible(filePath,)) { return null; }

  const parts = acceptEncoding.split(",",).map((part,) => part.trim()).filter((part,) => part !== "");
  const tokenOf = (part: string,): string => part.split(";", 1,)[0]?.trim().toLowerCase() ?? "";
  const explicit = new Set(parts.map(tokenOf,),);

  // RFC 9110 §12.5.3: '*' accepts any coding not explicitly named. Expand it
  // into our supported codings at its q; explicit entries (including q=0
  // refusals) are left alone so they keep precedence over the wildcard.
  const wildcard = parts.find((part,) => tokenOf(part,) === "*");
  let candidates = parts;
  if (wildcard) {
    const qParam = /;\s*q\s*=\s*([\d.]+)/i.exec(wildcard,);
    const q = qParam ? Number(qParam[1],) : 1;
    if (Number.isFinite(q,) && q > 0) {
      candidates = [
        ...parts,
        ...CODING_PRIORITY.filter((coding,) => !explicit.has(coding,)).map((coding,) => `${coding};q=${q}`),
      ];
    }
  }

  // parseAcceptEncoding q-sorts stably. Pre-sorting the raw parts by the
  // legacy priority keeps br > zstd > gzip on equal q without a second parser.
  const rank = (part: string,): number => {
    const index = CODING_PRIORITY.indexOf(tokenOf(part,),);
    return index === -1 ? CODING_PRIORITY.length : index;
  };

  const ordered = candidates.toSorted((a, b,) => rank(a,) - rank(b,));

  for (const encoding of parseAcceptEncoding(ordered.join(", ",).toLowerCase(),)) {
    const suffix = VARIANT_SUFFIXES[encoding];
    if (!suffix) { continue; }
    const path = `${filePath}${suffix}`;
    if (existsSync(path,)) {
      return { path, encoding, };
    }
  }

  return null;
}
