import { serve } from "bun";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { compressAssets } from "./content/compress";
import { loadConfig } from "./config/load";
import { initAgeGate, dispatch as dispatchAgeGate } from "./age-gate/controller";
import { getDb } from "./db/index";

const DOCS_PATH = join(import.meta.dir, "..", "docs", ".vitepress", "dist");

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

function getContentType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return MIME_TYPES[ext] ?? "text/plain";
}

const PUBLIC_DIR = join(import.meta.dir, "..", "dist", "public");

const COMPRESSIBLE_EXTS = new Set([".css", ".js", ".html", ".json", ".svg"]);

function isCompressible(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase();
  return ext ? COMPRESSIBLE_EXTS.has(`.${ext}`) : false;
}

function findCompressedVariant(
  filePath: string,
  acceptEncoding: string,
): { path: string; encoding: string } | null {
  if (!isCompressible(filePath)) return null;

  const encodings = new Set(acceptEncoding.split(",").map((encoding) => encoding.trim().toLowerCase()));

  if (encodings.has("br") && existsSync(`${filePath}.br`)) {
    return { path: `${filePath}.br`, encoding: "br" };
  }
  if (encodings.has("zstd") && existsSync(`${filePath}.zst`)) {
    return { path: `${filePath}.zst`, encoding: "zstd" };
  }
  if (encodings.has("gzip") && existsSync(`${filePath}.gz`)) {
    return { path: `${filePath}.gz`, encoding: "gzip" };
  }

  return null;
}

function start() {
  const config = loadConfig();
  initAgeGate(config.ageGate);
  const db = getDb();

  const sourcePublicDir = join(import.meta.dir, "public");
  const destinationPublicDir = join(import.meta.dir, "..", "dist", "public");

  if (existsSync(sourcePublicDir)) {
    const result = compressAssets(sourcePublicDir, destinationPublicDir);
    if (result.total > 0) {
      console.log(
        `Compressed ${result.total} files: ${result.originalBytes}B → ` +
          `gz:${result.compressedBytes.gz}B zst:${result.compressedBytes.zst}B br:${result.compressedBytes.br}B`,
      );
    }
  }

  serve({
    port: config.server.port,
    fetch: async (request: Request) => {
      const url = new URL(request.url);

      if (url.pathname.startsWith("/api/")) {
        // ── Age gate routes ──────────────────────────────
        const ageGateResult = await dispatchAgeGate(request, db, null, null);
        if (ageGateResult) return ageGateResult;

        return Response.json({ error: "Not implemented" }, { status: 501 });
      }

      if (
        process.env.DOCS_ENABLED !== "false" &&
        url.pathname.startsWith("/docs/")
      ) {
        let filePath = url.pathname.slice(5);
        if (filePath === "" || filePath.endsWith("/")) {
          filePath += "index.html";
        }

        const fullPath = join(DOCS_PATH, filePath);

        if (existsSync(fullPath)) {
          const content = readFileSync(fullPath);
          return new Response(content, {
            headers: { "Content-Type": getContentType(filePath) },
          });
        }

        return new Response("Documentation not found", { status: 404 });
      }

      const publicPath = join(
        PUBLIC_DIR,
        url.pathname === "/" ? "index.html" : url.pathname,
      );

      if (existsSync(publicPath)) {
        const acceptEncoding = request.headers.get("accept-encoding") ?? "";
        const variant = findCompressedVariant(publicPath, acceptEncoding);

        if (variant) {
          const content = readFileSync(variant.path);
          return new Response(content, {
            headers: {
              "Content-Type": getContentType(publicPath),
              "Content-Encoding": variant.encoding,
              "Vary": "Accept-Encoding",
            },
          });
        }

        const content = readFileSync(publicPath);
        return new Response(content, {
          headers: { "Content-Type": getContentType(publicPath) },
        });
      }

      return new Response("Loop Lore - Documentation available at /docs/");
    },
  });

  console.log(`Server listening on http://localhost:${config.server.port}`);
  console.log(`Documentation available at http://localhost:${config.server.port}/docs/`);
}

start();