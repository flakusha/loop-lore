import { serve } from "bun";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { compressAssets } from "./content/compress";
import { loadConfig } from "./config/load";
import { initAgeGate, dispatch as dispatchAgeGate } from "./age-gate/controller";
import { dispatch as dispatchGeneration } from "./generation/controller";
import { getDatabase } from "./db/index";
import { authenticate, compose, errorBoundary } from "./middleware/index";
import type { RequestContext } from "./middleware/index";
import { ensureTlsCerts } from "./config/cert";

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
  const extension = filePath.split(".").pop()?.toLowerCase() ?? "";
  return MIME_TYPES[extension] ?? "text/plain";
}

const PUBLIC_DIR = join(import.meta.dir, "..", "dist", "public");

const COMPRESSIBLE_EXTS = new Set([".css", ".js", ".html", ".json", ".svg"]);

function isCompressible(filePath: string): boolean {
  const extension = filePath.split(".").pop()?.toLowerCase();
  return extension ? COMPRESSIBLE_EXTS.has(`.${extension}`) : false;
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

/**
 * API request handler — runs middleware pipeline then dispatches to route controllers.
 *
 * Middleware chain: errorBoundary → auth → route dispatch
 * Auth populates RequestContext { userId, userRole, sessionId }.
 */
async function handleApiRequest(
  request: Request,
  database: ReturnType<typeof getDatabase>,
  config: ReturnType<typeof loadConfig>,
): Promise<Response> {
  // Build middleware chain: error boundary wraps auth + dispatch
  const pipeline = compose(
    [errorBoundary],
    async (req: Request, context: RequestContext): Promise<Response> => {
      // ── Age gate routes ──────────────────────────────
      const ageGateResult = await dispatchAgeGate(req, database, context.userId, context.userRole);
      if (ageGateResult) return ageGateResult;

      // ── Generation cancellation routes ───────────────
      const generationResult = await dispatchGeneration(req, context.userId, context.userRole);
      if (generationResult) return generationResult;

      return Response.json({ error: "Not implemented" }, { status: 501 });
    },
  );

  // Run auth first, short-circuit on failure
  const authResult = await authenticate(request, database, config.auth);
  if (authResult instanceof Response) return authResult;

  // Run pipeline with authenticated context
  return pipeline(request, authResult.context);
}

function start() {
  const config = loadConfig();
  initAgeGate(config.ageGate);
  const database = getDatabase();

  const sourcePublicDirectory = join(import.meta.dir, "public");
  const destinationPublicDirectory = join(import.meta.dir, "..", "dist", "public");

  if (existsSync(sourcePublicDirectory)) {
    const result = compressAssets(sourcePublicDirectory, destinationPublicDirectory);
    if (result.total > 0) {
      console.log(
        `Compressed ${result.total} files: ${result.originalBytes}B → ` +
          `gz:${result.compressedBytes.gz}B zst:${result.compressedBytes.zst}B br:${result.compressedBytes.br}B`,
      );
    }
  }

  // Pre-compress VitePress docs dist (if built)
  if (existsSync(DOCS_PATH)) {
    const docsResult = compressAssets(DOCS_PATH, DOCS_PATH);
    if (docsResult.total > 0) {
      console.log(
        `Docs compressed ${docsResult.total} files: ${docsResult.originalBytes}B → ` +
          `gz:${docsResult.compressedBytes.gz}B zst:${docsResult.compressedBytes.zst}B br:${docsResult.compressedBytes.br}B`,
      );
    }
  }

  // ── Shared fetch handler (HTTP + HTTPS) ───────────────────
  const fetchHandler = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleApiRequest(request, database, config);
    }

    if (process.env.DOCS_ENABLED !== "false" && url.pathname.startsWith("/docs/")) {
      let docPath = url.pathname.slice(5);

      // ── Section allowlist ────────────────────────────────
      const section = docPath.split("/")[0] || "index";
      if (config.docs.public && config.docs.public.length > 0) {
        if (!config.docs.public.includes(section)) {
          return new Response("Documentation not found", { status: 404 });
        }
      }

      // ── Resolve file path ─────────────────────────────────
      if (docPath === "" || docPath.endsWith("/")) {
        docPath += "index.html";
      }

      let fullPath = join(DOCS_PATH, docPath);

      // VitePress generates .html files for clean URLs
      if (!existsSync(fullPath)) {
        const htmlPath = fullPath + ".html";
        if (existsSync(htmlPath)) {
          fullPath = htmlPath;
        }
      }

      if (existsSync(fullPath)) {
        const acceptEncoding = request.headers.get("accept-encoding") ?? "";
        const variant = findCompressedVariant(fullPath, acceptEncoding);

        if (variant) {
          const content = readFileSync(variant.path);
          return new Response(content, {
            headers: {
              "Content-Type": getContentType(variant.path),
              "Content-Encoding": variant.encoding,
              Vary: "Accept-Encoding",
            },
          });
        }

        const content = readFileSync(fullPath);
        return new Response(content, {
          headers: { "Content-Type": getContentType(fullPath) },
        });
      }

      return new Response("Documentation not found", { status: 404 });
    }

    const publicPath = join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname);

    if (existsSync(publicPath)) {
      const acceptEncoding = request.headers.get("accept-encoding") ?? "";
      const variant = findCompressedVariant(publicPath, acceptEncoding);

      if (variant) {
        const content = readFileSync(variant.path);
        return new Response(content, {
          headers: {
            "Content-Type": getContentType(variant.path),
            "Content-Encoding": variant.encoding,
            Vary: "Accept-Encoding",
          },
        });
      }

      const content = readFileSync(publicPath);
      return new Response(content, {
        headers: { "Content-Type": getContentType(publicPath) },
      });
    }

    return new Response("Loop Lore - Documentation available at /docs/");
  };

  // ── HTTP server (always) ──────────────────────────────────
  serve({ port: config.server.port, fetch: fetchHandler });
  console.log(`HTTP  → http://localhost:${config.server.port}`);

  // ── HTTPS server (TLS certs configured or auto-generated) ─
  if (config.server.tls) {
    const tlsFiles = ensureTlsCerts(config.server.tls);

    if (tlsFiles) {
      const httpsPort = config.server.port + 443;
      serve({
        port: httpsPort,
        tls: {
          key: Bun.file(tlsFiles.key),
          cert: Bun.file(tlsFiles.cert),
        },
        fetch: fetchHandler,
      });
      console.log(`HTTPS → https://localhost:${httpsPort}`);
    } else {
      console.log("[tls] HTTPS unavailable — serving HTTP only");
    }
  }

  console.log(`Docs  → http://localhost:${config.server.port}/docs/`);
}

start();
