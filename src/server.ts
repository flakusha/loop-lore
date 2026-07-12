// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { serve } from "bun";
import { join, normalize } from "node:path";
import { existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { compressAssets, copyDirectory } from "./content/compress";
import { injectContentHashes } from "./content/hash-injection";
import { runMigrations } from "./db/migrate";
import { seedDefaultActors } from "./db/seed";
import { loadConfig } from "./config/load";
import { initAgeGate, dispatch as dispatchAgeGate } from "./age-gate/controller";
import { dispatch as dispatchGeneration } from "./generation/controller";
import { loadAllPlugins, dispatchPluginRoute, unloadAllPlugins } from "./plugins";
import { getDatabase } from "./db/index";
import { initializeProviders, registerProvider, OpenAiCompatibleProvider } from "./generation";
import {
  authenticate,
  compose,
  errorBoundary,
  ResponseHeaderPolicy,
  DynamicResponsePolicy,
} from "./middleware/index";
import type { RequestContext } from "./middleware/index";
import { apiDispatch } from "./routes/router";
import { dispatch as dispatchViews } from "./routes/views";
import { dispatchAuth } from "./routes/auth";
import { initSmk } from "./crypto";
import { ensureTlsCerts } from "./config/cert";
import { createLogger, getLogger } from "./logger";
import { ServerExternalManager } from "./services/server-external-manager";

// Route modules (import for registerRoute side-effects)
import "./routes/activity";
import "./routes/activity-stream";
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
import "./routes/frontend-logs";
import "./routes/message-encryption";
import "./routes/settings";
import "./routes/admin";
import "./routes/health";
import "./personas/controller";

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

function walkDirectorySync(dir: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile()) {
      files.push(entry.name);
    }
  }
  return files;
}

/**
 * Compute a weak ETag from file mtime + size.
 * Weak ETag (W/"…") allows semantically equivalent variants (e.g. gzip vs br).
 */
function computeEtag(filePath: string): string {
  const stat = statSync(filePath);
  return `W/"${stat.mtimeMs}-${stat.size}"`;
}

// Dev cache TTL. Prod: bump hashed files to 31536000 + immutable,
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
    "Content-Type": getContentType(fullPath),
    Vary: "Accept-Encoding",
  };

  // Dev-friendly 1-min cache. Prod: see STATIC_CACHE_MAX_AGE comment.
  if (cacheMaxAge > 0) {
    headers["Cache-Control"] = `public, max-age=${cacheMaxAge}`;
  }

  // Determine the actual serving path (compressed variant takes precedence)
  const variant = findCompressedVariant(fullPath, acceptEncoding);
  const servePath = variant ? variant.path : fullPath;

  const etag = computeEtag(servePath);
  headers.ETag = etag;

  // Short-circuit 304 when client has matching ETag
  if (ifNoneMatch === etag) {
    return new Response(null, { status: 304, headers: { ...headers, "Content-Length": "0" } });
  }

  const content = readFileSync(servePath);
  if (variant) {
    headers["Content-Encoding"] = variant.encoding;
  }
  return new Response(content, { headers });
}

// ── Options objects ──────────────────────────────────────────

export interface HandleApiRequestOpts {
  request: Request;
  database: ReturnType<typeof getDatabase>;
  config: ReturnType<typeof loadConfig>;
}

/**
 * API request handler — runs middleware pipeline then dispatches to route controllers.
 *
 * Middleware chain: errorBoundary → auth → route dispatch
 * Auth populates RequestContext { userId, userRole, sessionId }.
 */
export async function handleApiRequest({
  request,
  database,
  config,
}: HandleApiRequestOpts): Promise<Response> {
  // ── Auth-skip paths (login, demo-login, age-gate) — no auth required ──
  const url = new URL(request.url);
  const skipAuthPaths = ["/api/auth/login", "/api/demo-login", "/api/age-gate/status"];
  const skipAuth = skipAuthPaths.includes(url.pathname);

  if (skipAuth) {
    return compose([errorBoundary], async (req: Request, _context: RequestContext): Promise<Response> => {
      // Auth routes with empty context
      const context: RequestContext = { userId: null, userRole: null, sessionId: null };
      const authResult = await dispatchAuth({ request: req, context, database, config });
      if (authResult) return authResult;

      const ageGateResult = await dispatchAgeGate({
        request: req,
        database,
        userId: context.userId,
        userRole: context.userRole,
      });
      if (ageGateResult) return ageGateResult;

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
      const ageGateResult = await dispatchAgeGate({
        request: req,
        database,
        userId: context.userId,
        userRole: context.userRole,
      });
      if (ageGateResult) return ageGateResult;

      // ── Generation cancellation routes ───────────────
      const generationResult = await dispatchGeneration({
        request: req,
        database,
        userId: context.userId,
        userRole: context.userRole,
        config,
      });
      if (generationResult) return generationResult;

      // ── Plugin routes (dice-roller, etc.) ──────────────
      const pluginResult = await dispatchPluginRoute(req);
      if (pluginResult) return pluginResult;

      // ── Route router (chats, messages, characters, etc.) ──
      return apiDispatch({ request: req, context, database, config });
    },
  );

  // Run auth first, short-circuit on failure
  const authResult = await authenticate({ request, database, authConfig: config.auth });
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

  // Path traversal guard: must be under DOCS_PATH with trailing separator
  const docsPathWithSlash = DOCS_PATH + "/";
  if (!fullPath.startsWith(docsPathWithSlash) && fullPath !== DOCS_PATH) {
    return new Response("Documentation not found", { status: 404 });
  }
  if (existsSync(fullPath)) {
    const acceptEncoding = request.headers.get("accept-encoding") ?? "";
    const ifNoneMatch = request.headers.get("if-none-match");
    return respondWithFile(fullPath, acceptEncoding, ifNoneMatch);
  }

  return new Response("Documentation not found", { status: 404 });
}

async function start() {
  const config = loadConfig();
  createLogger(config.logging);
  initAgeGate(config.ageGate);
  await initSmk(config.encryption);
  initializeProviders(config);

  // Startup health check — scan providers and log any failures
  const { scanAllProviders } = await import("./admin/provider-health");
  const healthResults = await scanAllProviders();
  const failedProviders = healthResults.filter((p) => p.status !== "healthy");
  const startLogger = getLogger();
  if (failedProviders.length > 0) {
    startLogger.warn("providers unreachable on startup", {
      module: "server",
      failedProviders: failedProviders.map((p) => p.name),
    });
  } else {
    startLogger.info("all providers healthy", { module: "server", count: healthResults.length });
  }

  const database = getDatabase();
  const logger = getLogger();

  const serverManager = new ServerExternalManager(logger);
  const serverLogger = logger.child({ module: "server" });

  // ── Response-header policy (FExBE) — built once, applied to every response ──
  const headerPolicy = new ResponseHeaderPolicy(config.headers);

  // ── Dynamic-response policy — minify + validate + compress runtime bodies ──
  const dynamicPolicy = new DynamicResponsePolicy(config.dynamicResponse, logger);

  // ── Shared fetch handler (HTTP + HTTPS) ───────────────────
  const fetchHandler = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    let response: Response;

    if (url.pathname.startsWith("/api/")) {
      response = await handleApiRequest({ request, database, config });
    } else {
      // ── View templates and character/world routes ───────────────
      const viewResponse = await dispatchViews({
        request,
        context: { userId: null, userRole: null, sessionId: null },
        database,
        config,
      });
      if (viewResponse) {
        response = viewResponse;
      } else {
        const docsResult = handleDocsRequest(url, request, config);
        if (docsResult) {
          response = docsResult;
        } else {
          const publicPath = normalize(join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname));

          // Path traversal guard: must be under PUBLIC_DIR
          const publicDirWithSlash = PUBLIC_DIR + "/";
          if (publicPath.startsWith(publicDirWithSlash) || publicPath === PUBLIC_DIR) {
            let fullPath = publicPath;

            if (!existsSync(fullPath)) {
              const htmlPath = fullPath + ".html";
              if (existsSync(htmlPath)) fullPath = htmlPath;
            }

            if (existsSync(fullPath)) {
              const acceptEncoding = request.headers.get("accept-encoding") ?? "";
              const ifNoneMatch = request.headers.get("if-none-match");
              response = respondWithFile(fullPath, acceptEncoding, ifNoneMatch);
            } else {
              response = new Response("Not found", { status: 404 });
            }
          } else {
            response = new Response("Not found", { status: 404 });
          }
        }
      }
    }

    // Optimize dynamic bodies (minify + validate + compress) before headers.
    response = await dynamicPolicy.apply({ request, response });

    // Apply centralized response-header policy (security / perf / observability).
    return headerPolicy.apply({ request, response });
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

  // ── Run migrations before serving (ensure DB schema ready) ───
  await runMigrations(database);
  await seedDefaultActors(database);

  // ── Background initialization (non-blocking) ─────────────
  const initPromises: Promise<void>[] = [];

  // Auto-start external AI servers (llama.cpp, sd.cpp) in background
  const autoStart = config.generation.autoStart;
  const llamaCppCfg = autoStart?.llamaCpp;
  if (llamaCppCfg?.enabled) {
    initPromises.push(
      (async () => {
        const instance = await serverManager.startLlamaCpp(llamaCppCfg);
        if (instance) {
          const name = llamaCppCfg.alias || "llama";
          registerProvider(
            name,
            new OpenAiCompatibleProvider({
              name,
              label: "Auto-started llama.cpp",
              baseUrl: `http://127.0.0.1:${instance.port}/v1`,
              model: name,
              timeout: 30_000,
              retries: 3,
              allowUserApiKey: false,
              models: {},
            }),
          );
          if (!config.generation.defaultProvider) {
            config.generation.defaultProvider = name;
          }
          config.generation.defaultModels[name] ??= name;
        }
      })(),
    );
  }
  const llamaSwapCfg = autoStart?.llamaSwap;
  if (llamaSwapCfg?.enabled) {
    initPromises.push(
      (async () => {
        const instance = await serverManager.startLlamaSwap({ configPath: llamaSwapCfg.configPath });
        if (instance) {
          serverLogger.info(`llama-swap ready → http://127.0.0.1:${instance.port}`);
        }
      })(),
    );
  }
  const sdCppCfg = autoStart?.sdCpp;
  if (sdCppCfg?.enabled) {
    initPromises.push(
      (async () => {
        await serverManager.startSdCpp(sdCppCfg);
      })(),
    );
  }

  // Resolve all background init before proceeding to rest
  await Promise.all(initPromises);

  // ── Load all plugins (core → community → local) ──────
  await loadAllPlugins(database);

  // ── Auto-build frontend JS if missing ────────────────────
  const distPublic = join(import.meta.dir, "..", "dist", "public");
  const jsTarget = join(distPublic, "app.js");
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

  // Helper: check if source is newer than destination
  function needsCompression(srcDir: string, destDir: string): boolean {
    if (!existsSync(destDir)) return true;
    const srcFiles = walkDirectorySync(srcDir);
    for (const f of srcFiles) {
      const srcPath = join(srcDir, f);
      const destPath = join(destDir, f);
      if (!existsSync(destPath)) return true;
      const srcStat = statSync(srcPath);
      const destStat = statSync(destPath);
      if (srcStat.mtimeMs > destStat.mtimeMs) return true;
    }
    return false;
  }

  if (existsSync(sourcePublicDirectory)) {
    copyDirectory(sourcePublicDirectory, destinationPublicDirectory);
    if (needsCompression(sourcePublicDirectory, destinationPublicDirectory)) {
      const result = await compressAssets(sourcePublicDirectory, destinationPublicDirectory);
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
  }

  if (existsSync(sourceViewsDirectory)) {
    copyDirectory(sourceViewsDirectory, destinationPublicDirectory);
    if (needsCompression(sourceViewsDirectory, destinationPublicDirectory)) {
      const result = await compressAssets(sourceViewsDirectory, destinationPublicDirectory);
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
  }

  // Inject content-hashed filenames into HTML (enables immutable cache for hashed assets).
  // Runs after copyDirectory so newly-copied HTML templates also get hashed references.
  const hashResult = injectContentHashes(destinationPublicDirectory);
  if (hashResult.replaced > 0) {
    logger.info({
      message: "Hash-injected references",
      replaced: hashResult.replaced,
      skipped: hashResult.skipped,
    });
  }

  // Pre-compress VitePress docs dist (if built)
  if (existsSync(DOCS_PATH)) {
    const docsResult = await compressAssets(DOCS_PATH, DOCS_PATH);
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
