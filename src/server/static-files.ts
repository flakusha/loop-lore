// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
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

function getContentType(filePath: string,): string {
  const extension = filePath.split(".",).pop()?.toLowerCase() ?? "";
  return MIME_TYPES[extension] ?? "text/plain";
}

const PUBLIC_DIR = join(import.meta.dir, "..", "..", "dist", "public",);

const COMPRESSIBLE_EXTS = new Set([".css", ".js", ".html", ".json", ".svg",],);

function isCompressible(filePath: string,): boolean {
  const extension = filePath.split(".",).pop()?.toLowerCase();
  return extension ? COMPRESSIBLE_EXTS.has(`.${extension}`,) : false;
}

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
 */
function computeEtag(filePath: string,): string {
  const stat = statSync(filePath,);
  return `W/"${stat.mtimeMs}-${stat.size}"`;
}

// Dev cache TTL. Prod: bump hashed files to IMMUTABLE_CACHE_MAX_AGE + immutable,
// non-hashed to 3600 (or no-cache). See injectContentHashes in build/compress.ts.
const STATIC_CACHE_MAX_AGE = 60;

/**
 * Serve a static file with optional compressed variant, cache headers, and ETag.
 * Shared between docs path and public path serving.
 */
function respondWithFile(
  fullPath: string,
  acceptEncoding: string,
  ifNoneMatch: string | null,
  cacheMaxAge = STATIC_CACHE_MAX_AGE,
): Response {
  const headers: Record<string, string> = {
    "Content-Type": getContentType(fullPath,),
    Vary: "Accept-Encoding",
  };

  // Dev-friendly 1-min cache. Prod: see STATIC_CACHE_MAX_AGE comment.
  if (cacheMaxAge > 0) {
    headers["Cache-Control"] = `public, max-age=${cacheMaxAge}`;
  }

  // Determine the actual serving path (compressed variant takes precedence)
  const variant = findCompressedVariant(fullPath, acceptEncoding,);
  const servePath = variant ? variant.path : fullPath;

  const etag = computeEtag(servePath,);
  headers.ETag = etag;

  // Short-circuit 304 when client has matching ETag
  if (ifNoneMatch === etag) {
    return new Response(null, { status: 304, headers: { ...headers, "Content-Length": "0", }, },);
  }

  const content = readFileSync(servePath,);
  if (variant) {
    headers["Content-Encoding"] = variant.encoding;
  }
  return new Response(content, { headers, },);
}

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
  if (!fullPath.startsWith(docsPathWithSlash,) && fullPath !== DOCS_PATH) {
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
 */
export function createNonApiHandler(
  docs: { public?: string[] },
): (request: Request,) => Promise<Response> {
  return async (request: Request,): Promise<Response> => {
    const url = new URL(request.url,);

    const docsResult = handleDocsRequest(url, request, docs,);
    if (docsResult) { return docsResult; }

    const publicPath = normalize(join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname,),);

    // Path traversal guard: must be under PUBLIC_DIR
    const publicDirWithSlash = `${PUBLIC_DIR}/`;
    if (publicPath.startsWith(publicDirWithSlash,) || publicPath === PUBLIC_DIR) {
      let fullPath = publicPath;

      if (!existsSync(fullPath,)) {
        const htmlPath = `${fullPath}.html`;
        if (existsSync(htmlPath,)) { fullPath = htmlPath; }
      }

      if (existsSync(fullPath,)) {
        const ext = fullPath.split(".",).pop()?.toLowerCase();
        if (ext === "html" || ext === "htm") {
          // Redirects: /views/* paths should go to /views/ (handled by route)
          if (url.pathname.startsWith("/views/",)) {
            return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
          }
          const head = readFileSync(fullPath, "utf8",).slice(0, 1024,).trimStart();
          if (!head.startsWith("<!doctype",) && !head.startsWith("<!DOCTYPE",) && !head.startsWith("<html",)) {
            return new Response("Not found", { status: 404, },);
          }
        }
        const acceptEncoding = request.headers.get("accept-encoding",) ?? "";
        const ifNoneMatch = request.headers.get("if-none-match",);
        return respondWithFile(fullPath, acceptEncoding, ifNoneMatch,);
      }
    }

    return new Response("Not found", { status: 404, },);
  };
}

export { walkDirectorySync, };
