// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 281

import { existsSync, readdirSync, readFileSync, statSync, } from "node:fs";
import { join, normalize, } from "node:path";

export const DOCS_PATH = join(import.meta.dir, "..", "..", "docs", ".vitepress", "dist",);

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
};

/**
 * @param filePath
 */
function getContentType(filePath: string,): string {
  const extension = filePath.split(".",).pop()?.toLowerCase() ?? "";
  return MIME_TYPES[extension] ?? "text/plain";
}

const PUBLIC_DIR = join(import.meta.dir, "..", "..", "dist", "public",);

const COMPRESSIBLE_EXTS = new Set([".css", ".js", ".html", ".json", ".svg",],);

/**
 * @param filePath
 */
function isCompressible(filePath: string,): boolean {
  const extension = filePath.split(".",).pop()?.toLowerCase();
  return extension ? COMPRESSIBLE_EXTS.has(`.${extension}`,) : false;
}

/**
 * @param filePath
 * @param acceptEncoding
 */
function findCompressedVariant(
  filePath: string,
  acceptEncoding: string,
): { path: string; encoding: string } | null {
  if (!isCompressible(filePath,)) { return null; }

  const encodings = new Set<string>();
  for (const encoding of acceptEncoding.split(",",)) { encodings.add(encoding.trim().toLowerCase(),); }

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

/**
 * @param dir
 */
function walkDirectorySync(dir: string,): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true, },);
  for (const entry of entries) {
    if (entry.isFile()) {
      files.push(entry.name,);
    }
  }
  return files;
}

/**
 * Compute a weak ETag from file mtime + size.
 * Weak ETag (W/"…") allows semantically equivalent variants (e.g. gzip vs br).
 * @param filePath
 */
function computeEtag(filePath: string,): string {
  const stat = statSync(filePath,);
  return `W/"${stat.mtimeMs}-${stat.size}"`;
}

/**
 * Detect whether a file path contains a content hash (build output).
 * Hash format: filename.HASH.ext where HASH is ~8+ hex chars.
 * @param filePath
 */
function isHashedAsset(filePath: string,): boolean {
  const name = filePath.split("/",).pop() ?? "";
  // Match segments that look like content hashes (8+ hex chars).
  return /\.[0-9a-f]{8,}\.[a-z0-9]+$/i.test(name,);
}

// Dev cache TTL. Prod: bump hashed files to IMMUTABLE_CACHE_MAX_AGE + immutable,
// non-hashed to 3600 (or no-cache). See injectContentHashes in build/compress.ts.
const STATIC_CACHE_MAX_AGE = 60;

/**
 * Build the Cache-Control header value for a static file response.
 * Hashed assets (content-hashed filenames) get long-lived immutable caching.
 * @param filePath
 * @param maxAge
 */
function buildCacheControl(filePath: string, maxAge: number,): string {
  if (maxAge <= 0) { return "no-store"; }
  if (isHashedAsset(filePath,)) { return "public, max-age=31536000, immutable"; }
  return `public, max-age=${maxAge}`;
}

/**
 * Serve a static file with optional compressed variant, cache headers, and ETag.
 * Shared between docs path and public path serving.
 * @param fullPath
 * @param acceptEncoding
 * @param ifNoneMatch
 * @param cacheMaxAge
 */
function respondWithFile(
  fullPath: string,
  acceptEncoding: string,
  ifNoneMatch: string | null,
  cacheMaxAge = STATIC_CACHE_MAX_AGE,
): Response {
  const headers: Record<string, string> = {
    "Content-Type": getContentType(fullPath,),
  };

  // Only set Vary when a compressed variant may be served (RFC 7231).
  const variant = findCompressedVariant(fullPath, acceptEncoding,);
  if (variant) { headers["Vary"] = "Accept-Encoding"; }
  headers["Cache-Control"] = buildCacheControl(fullPath, cacheMaxAge,);

  // Determine the actual serving path (compressed variant takes precedence)
  const servePath = variant ? variant.path : fullPath;

  const etag = computeEtag(servePath,);
  headers["ETag"] = etag;

  // Short-circuit 304 when the client's cached representation matches.
  // RFC 7232: If-None-Match may be a comma-separated ETag list or "*".
  // Strict string match is safe here because the server emits a single
  // weak ETag (W/"mtime-size") per resource; the browser echoes that
  // exact string back, so weak comparison would be a no-op.
  if (
    ifNoneMatch &&
    (ifNoneMatch === "*" ||
      ifNoneMatch.split(",",).some((candidate,) => candidate.trim() === etag))
  ) {
    return new Response(null, { status: 304, headers: { ...headers, "Content-Length": "0", }, },);
  }

  const content = readFileSync(servePath,);
  if (variant) {
    headers["Content-Encoding"] = variant.encoding;
  }
  return new Response(content, { headers, },);
}

/**
 * @param url
 * @param request
 * @param docs
 * @param docs.public
 */
export function handleDocsRequest(
  url: URL,
  request: Request,
  docs: { public?: string[] },
): Response | null {
  if (process.env.DOCS_ENABLED === "false") { return null; }
  if (!url.pathname.startsWith("/docs/",)) { return null; }

  let docPath = url.pathname.slice(5,);
  const section = docPath.split("/", 1,)[0] || "index";

  if (docs.public && docs.public.length > 0 && !docs.public.includes(section,)) {
    return new Response("Documentation not found", { status: 404, },);
  }

  if (docPath === "" || docPath.endsWith("/",)) {
    docPath += "index.html";
  }

  let fullPath = normalize(join(DOCS_PATH, docPath,),);

  if (!existsSync(fullPath,)) {
    const htmlPath = `${fullPath}.html`;
    if (existsSync(htmlPath,)) {
      fullPath = htmlPath;
    }
  }

  // Path traversal guard: must be under DOCS_PATH with trailing separator
  const docsPathWithSlash = `${DOCS_PATH}/`;
  if (fullPath !== DOCS_PATH && !fullPath.startsWith(docsPathWithSlash,)) {
    return new Response("Documentation not found", { status: 404, },);
  }
  if (existsSync(fullPath,)) {
    const acceptEncoding = request.headers.get("accept-encoding",) ?? "";
    const ifNoneMatch = request.headers.get("if-none-match",);
    return respondWithFile(fullPath, acceptEncoding, ifNoneMatch,);
  }

  return new Response("Documentation not found", { status: 404, },);
}

/**
 * Build the non-API request handler: serves views, docs, and static files.
 * @param docs
 * @param docs.public
 */
export function createNonApiHandler(
  docs: { public?: string[] },
): (request: Request,) => Promise<Response> {
  return async (request: Request,): Promise<Response> => {
    const url = new URL(request.url,);

    const docsResult = handleDocsRequest(url, request, docs,);
    if (docsResult) { return docsResult; }

    const publicPath = normalize(join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname,),);
    const publicDirWithSlash = `${PUBLIC_DIR}/`;
    if (publicPath !== PUBLIC_DIR && !publicPath.startsWith(publicDirWithSlash,)) {
      return new Response("Not found", { status: 404, },);
    }

    const fullPath = resolveFilePath(publicPath,);
    if (!fullPath) { return new Response("Not found", { status: 404, },); }

    const ext = fullPath.split(".",).pop()?.toLowerCase();
    if (ext === "html" || ext === "htm") {
      if (url.pathname.startsWith("/views/",)) {
        return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
      }
      if (!isValidHtml(fullPath,)) { return new Response("Not found", { status: 404, },); }
    }

    const acceptEncoding = request.headers.get("accept-encoding",) ?? "";
    const ifNoneMatch = request.headers.get("if-none-match",);
    return respondWithFile(fullPath, acceptEncoding, ifNoneMatch,);
  };
}

/**
 * Resolve file path, appending .html if needed. Returns null if not found.
 * @param publicPath
 */
function resolveFilePath(publicPath: string,): string | null {
  if (existsSync(publicPath,)) { return publicPath; }
  const htmlPath = `${publicPath}.html`;
  return existsSync(htmlPath,) ? htmlPath : null;
}

/**
 * Check if a file starts with valid HTML doctype/tag.
 * @param fullPath
 */
function isValidHtml(fullPath: string,): boolean {
  const head = readFileSync(fullPath, "utf8",).slice(0, 1024,).trimStart();
  return head.startsWith("<!doctype",) || head.startsWith("<!DOCTYPE",) || head.startsWith("<html",);
}

export { walkDirectorySync, };
