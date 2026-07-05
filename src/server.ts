// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { serve } from "bun";
import { join, normalize } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { compressAssets, copyDirectory } from "./content/compress";
import { loadConfig } from "./config/load";
import { initAgeGate, dispatch as dispatchAgeGate } from "./age-gate/controller";
import { dispatch as dispatchGeneration } from "./generation/controller";
import { dispatch as dispatchDice } from "./dice/index";
import { getDatabase } from "./db/index";
import { authenticate, compose, errorBoundary } from "./middleware/index";
import type { RequestContext } from "./middleware/index";
import { jsonError, HttpStatus } from "./routes/http-utils";
import { apiDispatch } from "./routes/router";
import { dispatch as dispatchViews, serveView } from "./routes/views";
import { dispatchAuth } from "./routes/auth";
// Route modules (import for registerRoute side-effects)
import "./routes/chats";
import "./routes/messages";
import "./routes/characters";
import "./routes/users";
import "./routes/worlds";
import "./routes/api-keys";
import "./assets/controller";
import { ensureTlsCerts } from "./config/cert";
import { createLogger, getLogger } from "./logger";

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

  const encodings = new Set<string>();
  for (const encoding of acceptEncoding.split(",")) encodings.add(encoding.trim().toLowerCase());

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
 * Serve a static file with optional compressed variant.
 * Shared between docs path and public path serving.
 */
function respondWithFile(fullPath: string, acceptEncoding: string): Response {
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

/**
 * API request handler — runs middleware pipeline then dispatches to route controllers.
 *
 * Middleware chain: errorBoundary → auth → route dispatch
 * Auth populates RequestContext { userId, userRole, sessionId }.
 */
export async function handleApiRequest(
  request: Request,
  database: ReturnType<typeof getDatabase>,
  config: ReturnType<typeof loadConfig>,
): Promise<Response> {
  // ── Auth-skip paths (login, demo-login) — no auth required ──
  const url = new URL(request.url);
  const skipAuth =
    url.pathname === "/api/auth/login" ||
    url.pathname === "/api/demo-login";

  if (skipAuth) {
    return compose(
      [errorBoundary],
      async (req: Request, _context: RequestContext): Promise<Response> => {
        // Auth routes with empty context
        const context: RequestContext = { userId: null, userRole: null, sessionId: null };
        const authResult = await dispatchAuth({ request: req, context, database, config });
        if (authResult) return authResult;

        return apiDispatch({ request: req, context, database, config });
      },
    )(request, { userId: null, userRole: null, sessionId: null });
  }

  // ── Authenticated routes ─────────────────────────────────
  // Build middleware chain: error boundary wraps auth + dispatch
  const pipeline = compose(
    [errorBoundary],
    async (req: Request, context: RequestContext): Promise<Response> => {
      // ── Auth routes (logout, me) — need session context ──
      const authResult = await dispatchAuth({ request: req, context, database, config });
      if (authResult) return authResult;

      // ── Age gate routes ──────────────────────────────
      const ageGateResult = await dispatchAgeGate(req, database, context.userId, context.userRole);
      if (ageGateResult) return ageGateResult;

      // ── Generation cancellation routes ───────────────
      const generationResult = await dispatchGeneration(req, context.userId, context.userRole);
      if (generationResult) return generationResult;

      // ── Dice roll routes ─────────────────────────────
      const diceResult = await dispatchDice(req, context.userId, context.userRole);
      if (diceResult) return diceResult;

      // ── Route router (chats, messages, characters, etc.) ──
      return apiDispatch({ request: req, context, database, config });
    },
  );

  // Run auth first, short-circuit on failure
  const authResult = await authenticate(request, database, config.auth);
  if (authResult instanceof Response) return authResult;

  // Run pipeline with authenticated context
  return pipeline(request, authResult.context);
}

function handleDocsRequest(
  url: URL,
  request: Request,
  config: ReturnType<typeof loadConfig>,
): Response | null {
  if (process.env.DOCS_ENABLED === "false") return null;
  if (!url.pathname.startsWith("/docs/")) return null;

  let docPath = url.pathname.slice(5);
  const section = docPath.split("/", 1)[0] || "index";

  if (config.docs.public && config.docs.public.length > 0 && !config.docs.public.includes(section)) {
    return new Response("Documentation not found", { status: 404 });
  }

  if (docPath === "" || docPath.endsWith("/")) {
    docPath += "index.html";
  }

  let fullPath = normalize(join(DOCS_PATH, docPath));

  if (!existsSync(fullPath)) {
    const htmlPath = fullPath + ".html";
    if (existsSync(htmlPath)) {
      fullPath = htmlPath;
    }
  }

  if (fullPath.startsWith(join(DOCS_PATH, "/")) && existsSync(fullPath)) {
    const acceptEncoding = request.headers.get("accept-encoding") ?? "";
    return respondWithFile(fullPath, acceptEncoding);
  }

  return new Response("Documentation not found", { status: 404 });
}

function start() {
  const config = loadConfig();
  createLogger(config.logging);
  initAgeGate(config.ageGate);
  const database = getDatabase();
  const logger = getLogger();

  const sourcePublicDirectory = join(import.meta.dir, "public");
  const sourceViewsDirectory = join(import.meta.dir, "..", "views");
  const destinationPublicDirectory = join(import.meta.dir, "..", "dist", "public");

  if (existsSync(sourcePublicDirectory)) {
    copyDirectory(sourcePublicDirectory, destinationPublicDirectory);
    const result = compressAssets(sourcePublicDirectory, destinationPublicDirectory);
    if (result.total > 0) {
      logger.info({
        message: "Compressed assets",
        total: result.total,
        bytes: result.originalBytes,
        gz: result.compressedBytes.gz,
        zst: result.compressedBytes.zst,
        br: result.compressedBytes.br,
      });
    }
  }

  if (existsSync(sourceViewsDirectory)) {
    copyDirectory(sourceViewsDirectory, destinationPublicDirectory);
    const result = compressAssets(sourceViewsDirectory, destinationPublicDirectory);
    if (result.total > 0) {
      logger.info({
        message: "Compressed views",
        total: result.total,
        bytes: result.originalBytes,
        gz: result.compressedBytes.gz,
        zst: result.compressedBytes.zst,
        br: result.compressedBytes.br,
      });
    }
  }

  // Pre-compress VitePress docs dist (if built)
  if (existsSync(DOCS_PATH)) {
    const docsResult = compressAssets(DOCS_PATH, DOCS_PATH);
    if (docsResult.total > 0) {
      logger.info({
        message: "Docs compressed",
        total: docsResult.total,
        bytes: docsResult.originalBytes,
        gz: docsResult.compressedBytes.gz,
        zst: docsResult.compressedBytes.zst,
        br: docsResult.compressedBytes.br,
      });
    }
  }

  // ── Shared fetch handler (HTTP + HTTPS) ───────────────────
  const fetchHandler = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleApiRequest(request, database, config);
    }

    // ── View templates and character/world routes ───────────────
    // Try views dispatch first (handles /views/:name, /character/:slug, /worlds, etc.)
    const viewResponse = await dispatchViews({ request, context: { userId: null, userRole: null, sessionId: null }, database, config });
    if (viewResponse) return viewResponse;

    const docsResult = handleDocsRequest(url, request, config);
    if (docsResult) return docsResult;

    const publicPath = normalize(join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname));

    if (publicPath.startsWith(join(PUBLIC_DIR, "/"))) {
      let fullPath = publicPath;

      // Try .html extension fallback for view templates
      if (!existsSync(fullPath)) {
        const htmlPath = fullPath + ".html";
        if (existsSync(htmlPath)) {
          fullPath = htmlPath;
        }
      }

      if (existsSync(fullPath)) {
        const acceptEncoding = request.headers.get("accept-encoding") ?? "";
        return respondWithFile(fullPath, acceptEncoding);
      }
    }

    return new Response("Loop Lore - Documentation available at /docs/");
  };

  const serverLogger = logger.child({ module: "server" });

  // ── HTTP server (always) ──────────────────────────────────
  serve({ port: config.server.port, fetch: fetchHandler });
  serverLogger.info(`HTTP  → http://localhost:${config.server.port}`);

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
      serverLogger.info(`HTTPS → https://localhost:${httpsPort}`);
    } else {
      serverLogger.warn("HTTPS unavailable — serving HTTP only");
    }
  }

  serverLogger.info(`Docs  → http://localhost:${config.server.port}/docs/`);

  // ── Shutdown handler — flush logs before exit ──────────
  const shutdown = async (_signal: string) => {
    const SHUTDOWN_TIMEOUT = 5000;
    const flushed = logger.flush();
    const timer = setTimeout(() => {
      process.stderr.write(`[logger] flush timed out after ${SHUTDOWN_TIMEOUT}ms\n`);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT);
    await flushed;
    clearTimeout(timer);
    process.exit(0);
  };
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
}

start();
