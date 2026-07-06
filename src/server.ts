// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { serve } from "bun";
import { join, normalize } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { compressAssets, copyDirectory } from "./content/compress";
import { runMigrations } from "./db/migrate";
import { seedDefaultActors } from "./db/seed";
import { loadConfig } from "./config/load";
import { initAgeGate, dispatch as dispatchAgeGate } from "./age-gate/controller";
import { dispatch as dispatchGeneration } from "./generation/controller";
import { loadAllPlugins, dispatchPluginRoute, unloadAllPlugins } from "./plugins";
import { getDatabase } from "./db/index";
import { initializeProviders } from "./generation";
import { authenticate, compose, errorBoundary } from "./middleware/index";
import type { RequestContext } from "./middleware/index";
import { apiDispatch } from "./routes/router";
import { dispatch as dispatchViews } from "./routes/views";
import { dispatchAuth } from "./routes/auth";
import { initSmk } from "./crypto";
// Route modules (import for registerRoute side-effects)
import "./routes/chats";
import "./routes/messages";
import "./routes/characters";
import "./routes/users";
import "./routes/worlds";
import "./routes/api-keys";
import "./assets/controller";
import "./routes/actor-memories";
import "./routes/actor-lore-entries";
import "./routes/world-lore-entries";
import "./routes/actor-items";
import "./routes/actor-notes";
import "./routes/story-items";
import "./routes/story-states";
import "./routes/story-turns";
import { ensureTlsCerts } from "./config/cert";
import { createLogger, getLogger } from "./logger";
import { ServerExternalManager } from "./services/server-external-manager";

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
        "Content-Type": getContentType(fullPath),
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
  const skipAuth = url.pathname === "/api/auth/login" || url.pathname === "/api/demo-login";

  if (skipAuth) {
    return compose([errorBoundary], async (req: Request, _context: RequestContext): Promise<Response> => {
      // Auth routes with empty context
      const context: RequestContext = { userId: null, userRole: null, sessionId: null };
      const authResult = await dispatchAuth({ request: req, context, database, config });
      if (authResult) return authResult;

      return apiDispatch({ request: req, context, database, config });
    })(request, { userId: null, userRole: null, sessionId: null });
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
      const generationResult = await dispatchGeneration(
        req,
        database,
        context.userId,
        context.userRole,
        config,
      );
      if (generationResult) return generationResult;

      // ── Plugin routes (dice-roller, etc.) ──────────────
      const pluginResult = await dispatchPluginRoute(req);
      if (pluginResult) return pluginResult;

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

  if (fullPath.startsWith(DOCS_PATH + "/") && existsSync(fullPath)) {
    const acceptEncoding = request.headers.get("accept-encoding") ?? "";
    return respondWithFile(fullPath, acceptEncoding);
  }

  return new Response("Documentation not found", { status: 404 });
}

 
async function start() {
  const config = loadConfig();
  createLogger(config.logging);
  initAgeGate(config.ageGate);
  await initSmk(config.encryption);
  initializeProviders(config);
  const database = getDatabase();
  const logger = getLogger();

  const serverManager = new ServerExternalManager(logger);
  const serverLogger = logger.child({ module: "server" });

  // ── Shared fetch handler (HTTP + HTTPS) ───────────────────
  const fetchHandler = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleApiRequest(request, database, config);
    }

    // ── View templates and character/world routes ───────────────
    const viewResponse = await dispatchViews({
      request,
      context: { userId: null, userRole: null, sessionId: null },
      database,
      config,
    });
    if (viewResponse) return viewResponse;

    const docsResult = handleDocsRequest(url, request, config);
    if (docsResult) return docsResult;

    const publicPath = normalize(join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname));

    if (publicPath.startsWith(join(PUBLIC_DIR, "/"))) {
      let fullPath = publicPath;

      if (!existsSync(fullPath)) {
        const htmlPath = fullPath + ".html";
        if (existsSync(htmlPath)) fullPath = htmlPath;
      }

      if (existsSync(fullPath)) {
        const acceptEncoding = request.headers.get("accept-encoding") ?? "";
        return respondWithFile(fullPath, acceptEncoding);
      }
    }

    return new Response("Loop Lore - Documentation available at /docs/");
  };

  // ── Start HTTP server immediately so port is open ─────────
  serve({ port: config.server.port, fetch: fetchHandler });
  serverLogger.info(`HTTP  → http://localhost:${config.server.port}`);

  // ── HTTPS server (TLS certs configured or auto-generated) ─
  if (config.server.tls) {
    const tlsFiles = ensureTlsCerts(config.server.tls);
    if (tlsFiles) {
      const httpsPort = config.server.port + 443;
      serve({
        port: httpsPort,
        tls: { key: Bun.file(tlsFiles.key), cert: Bun.file(tlsFiles.cert) },
        fetch: fetchHandler,
      });
      serverLogger.info(`HTTPS → https://localhost:${httpsPort}`);
    } else {
      serverLogger.warn("HTTPS unavailable — serving HTTP only");
    }
  }

  serverLogger.info(`Docs  → http://localhost:${config.server.port}/docs/`);

  // ── Background initialization (non-blocking) ─────────────
  const initPromises: Promise<void>[] = [];

  // Run migrations in background
  initPromises.push(
    (async () => {
      try {
        await runMigrations(database);
        await seedDefaultActors(database);
      } catch (error) {
        logger.error({ message: "Migration/seeding failed — aborting startup", error: String(error) });
        process.exit(1);
      }
    })(),
  );

  // Auto-start external AI servers (llama.cpp, sd.cpp) in background
  const autoStart = config.generation.autoStart;
  if (autoStart?.llamaCpp?.enabled) {
    initPromises.push(serverManager.startLlamaCpp(autoStart.llamaCpp));
  }
  if (autoStart?.sdCpp?.enabled) {
    initPromises.push(serverManager.startSdCpp(autoStart.sdCpp));
  }

  // Resolve all background init before proceeding to rest
  await Promise.all(initPromises);

  // ── Load all plugins (core → community → local) ──────
  await loadAllPlugins(database);

  // ── Auto-build frontend JS if missing ────────────────────
  const distPublic = join(import.meta.dir, "..", "dist", "public");
  const jsTarget = join(distPublic, "alpine.js");
  if (!existsSync(jsTarget)) {
    logger.info({ message: "Frontend JS not built — auto-building..." });
    const result = spawnSync("bun", ["run", "build:frontend"], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    if (result.status === 0) {
      logger.info({ message: "Frontend build complete" });
    } else {
      logger.error({ message: "Frontend build failed — some features unavailable" });
    }
  }

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

  // ── Start liveliness probes for managed servers ──────────
  serverManager.startLivenessProbes();

  // ── Hard-exit guard — kills subprocesses at OS level ──
  process.on("exit", () => {
    serverManager.killAllSync();
  });

  // ── Graceful shutdown ────────────────────────────────────
  const shutdown = async (_signal: string) => {
    await serverManager.stopAll();
    await unloadAllPlugins();
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

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGHUP", () => void shutdown("SIGHUP"));

  process.on("uncaughtException", (err) => {
    try {
      logger.error({ message: "Uncaught exception", error: String(err) });
    } catch {
      /* last resort */
    }
    void shutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason) => {
    try {
      logger.error({ message: "Unhandled rejection", error: String(reason) });
    } catch {
      /* last resort */
    }
    void shutdown("unhandledRejection");
  });
}

// Only auto-start when executed directly (not imported by tests)
// Bun equivalent of `require.main === module`
const isMainModule = typeof Bun !== "undefined" && (Bun as { main?: string }).main === import.meta.path;
if (isMainModule) {
  await start();
}
