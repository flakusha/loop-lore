// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { existsSync, readdirSync, readFileSync, statSync, } from "node:fs";
import { existsSync, readdirSync, readFileSync, statSync, } from "node:fs";

import { serve, } from "bun";
import { spawnSync, } from "node:child_process";
import { join, normalize, } from "node:path";
import { initAgeGate, } from "./age-gate/controller";
import { ensureTlsCerts, } from "./config/cert";
import { loadConfig, } from "./config/load";
import { compressAssets, copyDirectory, } from "./content/compress";
import { injectContentHashes, } from "./content/hash-injection";
import { initSmk, } from "./crypto";
import { getDatabase, } from "./db/index";
import { runMigrations, } from "./db/migrate";
import { seedDefaultActors, } from "./db/seed";
import { createApp, } from "./elysia-app";
import { initializeProviders, OpenAiCompatibleProvider, registerProvider, } from "./generation";
import { initializeProviders, OpenAiCompatibleProvider, registerProvider, } from "./generation";
import { createLogger, getLogger, } from "./logger";
import { DynamicResponsePolicy, ResponseHeaderPolicy, } from "./middleware";
import { dispatchPluginRoute, loadAllPlugins, unloadAllPlugins, } from "./plugins";
import { dispatchPluginRoute, loadAllPlugins, unloadAllPlugins, } from "./plugins";
import { ServerExternalManager, } from "./services/server-external-manager";

const DOCS_PATH = join(import.meta.dir, "..", "docs", ".vitepress", "dist",);

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

const PUBLIC_DIR = join(import.meta.dir, "..", "dist", "public",);

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

// ── Options objects ──────────────────────────────────────────

/**
 * Wrap the Elysia app so EVERY outgoing response (routes, errors, static,
 * docs) passes through the dynamic-response and response-header policies.
 * Dynamic runs first (sets Content-Encoding/Vary); the header policy is
 * additive and only fills headers the route omitted.
 *
 * @param app - Built Elysia app (provides `app.fetch`).
 * @param config - Resolved config (supplies both policy config blocks).
 * @param logger - Logger for the dynamic-response policy.
 * @returns A fetch-style handler applying both policies in order.
 */
export function createRequestHandler(
  app: { fetch: (request: Request,) => Response | Promise<Response> },
  config: ReturnType<typeof loadConfig>,
  logger: ReturnType<typeof getLogger>,
): (request: Request,) => Promise<Response> {
  const headerPolicy = new ResponseHeaderPolicy(config.headers,);
  const dynamicPolicy = new DynamicResponsePolicy(config.dynamicResponse, logger,);

  return async (request: Request,): Promise<Response> => {
    let response = await app.fetch(request,);
    response = await dynamicPolicy.apply({ request, response, },);
    response = headerPolicy.apply({ request, response, },);
    return response;
  };
}

export interface HandleApiRequestOpts {
  request: Request;
  database: ReturnType<typeof getDatabase>;
  config: ReturnType<typeof loadConfig>;
}

/**
 * API request handler — dispatches to plugin routes.
 * All other API routes are handled by Elysia plugins.
 */
export async function handleApiRequest({ request, }: HandleApiRequestOpts,): Promise<Response> {
  const pluginResult = await dispatchPluginRoute(request,);
  if (pluginResult) { return pluginResult; }
  return new Response("Not found", { status: 404, },);
}

function handleDocsRequest(
  url: URL,
  request: Request,
  config: ReturnType<typeof loadConfig>,
): Response | null {
  if (process.env.DOCS_ENABLED === "false") { return null; }
  if (!url.pathname.startsWith("/docs/",)) { return null; }

  let docPath = url.pathname.slice(5,);
  const section = docPath.split("/", 1,)[0] || "index";

  if (config.docs.public && config.docs.public.length > 0 && !config.docs.public.includes(section,)) {
    return new Response("Documentation not found", { status: 404, },);
  }

  if (docPath === "" || docPath.endsWith("/",)) {
    docPath += "index.html";
  }

  let fullPath = normalize(join(DOCS_PATH, docPath,),);

  if (!existsSync(fullPath,)) {
    const htmlPath = fullPath + ".html";
    if (existsSync(htmlPath,)) {
      fullPath = htmlPath;
    }
  }

  // Path traversal guard: must be under DOCS_PATH with trailing separator
  const docsPathWithSlash = DOCS_PATH + "/";
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

async function start() {
  const config = loadConfig();
  createLogger(config.logging,);
  initAgeGate(config.ageGate,);
  await initSmk(config.encryption,);
  initializeProviders(config,);

  // Startup health check — scan providers and log any failures
  const { scanAllProviders, } = await import("./admin/provider-health");
  const healthResults = await scanAllProviders();
  const failedProviders = healthResults.filter((p,) => p.status !== "healthy");
  const startLogger = getLogger();
  if (failedProviders.length > 0) {
    startLogger.warn("providers unreachable on startup", {
      module: "server",
      failedProviders: failedProviders.map((p,) => p.name),
    },);
  } else {
    startLogger.info("all providers healthy", { module: "server", count: healthResults.length, },);
  }

  const database = getDatabase();
  const logger = getLogger();

  const serverManager = new ServerExternalManager(logger,);
  const serverLogger = logger.child({ module: "server", },);

  // ── Non-API request handler (views, docs, static files) ──
  const handleNonApiRequest = async (request: Request,): Promise<Response> => {
    const url = new URL(request.url,);

    const docsResult = handleDocsRequest(url, request, config,);
    if (docsResult) { return docsResult; }

    const publicPath = normalize(join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname,),);

    // Path traversal guard: must be under PUBLIC_DIR
    const publicDirWithSlash = PUBLIC_DIR + "/";
    if (publicPath.startsWith(publicDirWithSlash,) || publicPath === PUBLIC_DIR) {
      let fullPath = publicPath;

      if (!existsSync(fullPath,)) {
        const htmlPath = fullPath + ".html";
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

  // ── Elysia app (handles routing + transforms) ──────────────
  const app = createApp({
    database,
    config,
    handleNonApiRequest,
  },);

  // ── Centralized response-header + dynamic-response policies ──
  // Applied to EVERY outgoing response via createRequestHandler.
  const handleRequest = createRequestHandler(app, config, logger,);

  // ── Start HTTP server ──────────────────────────────────────
  serve({ port: config.server.port, fetch: handleRequest, },);
  serverLogger.info(`HTTP  → http://localhost:${config.server.port}`,);

  // ── HTTPS server (TLS certs configured or auto-generated) ─
  if (config.server.tls) {
    const tlsFiles = ensureTlsCerts(config.server.tls,);
    if (tlsFiles) {
      const httpsPort = config.server.port + 443;
      serve({
        port: httpsPort,
        tls: { key: Bun.file(tlsFiles.key,), cert: Bun.file(tlsFiles.cert,), },
        fetch: handleRequest,
      },);
      serverLogger.info(`HTTPS → https://localhost:${httpsPort}`,);
    } else {
      serverLogger.warn("HTTPS unavailable — serving HTTP only",);
    }
  }

  serverLogger.info(`Docs  → http://localhost:${config.server.port}/docs/`,);

  // ── Run migrations before serving (ensure DB schema ready) ───
  await runMigrations(database,);
  await seedDefaultActors(database, config,);

  // Admin — seed system config defaults + wire DB log transport
  const { seedDefaults, } = await import("./admin/config");
  await seedDefaults(database, config,);

  if (config.logging.dbEnabled) {
    const { DBTransport, } = await import("./logger/transports/db");
    logger.addTransport(new DBTransport(database,),);
  }

  // ── Background initialization (non-blocking) ─────────────
  const initPromises: Promise<void>[] = [];

  // Auto-start external AI servers (llama.cpp, sd.cpp) in background
  const autoStart = config.generation.autoStart;
  const llamaCppCfg = autoStart?.llamaCpp;
  if (llamaCppCfg?.enabled) {
    initPromises.push(
      (async () => {
        const instance = await serverManager.startLlamaCpp(llamaCppCfg,);
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
            },),
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
        const instance = await serverManager.startLlamaSwap({ configPath: llamaSwapCfg.configPath, },);
        if (instance) {
          serverLogger.info(`llama-swap ready → http://127.0.0.1:${instance.port}`,);
        }
      })(),
    );
  }
  const sdCppCfg = autoStart?.sdCpp;
  if (sdCppCfg?.enabled) {
    initPromises.push(
      (async () => {
        await serverManager.startSdCpp(sdCppCfg,);
      })(),
    );
  }

  // Resolve all background init before proceeding to rest
  await Promise.all(initPromises,);

  // ── Load all plugins (core → community → local) ──────
  await loadAllPlugins(database,);

  // ── Auto-build frontend JS if missing ────────────────────
  const distPublic = join(import.meta.dir, "..", "dist", "public",);
  const jsTarget = join(distPublic, "app.js",);
  if (!existsSync(jsTarget,)) {
    logger.info({ message: "Frontend JS not built — auto-building...", },);
    const result = spawnSync("bun", ["run", "build:frontend",], {
      stdio: ["ignore", "inherit", "inherit",],
    },);
    if (result.status === 0) {
      logger.info({ message: "Frontend build complete", },);
    } else {
      logger.error({ message: "Frontend build failed — some features unavailable", },);
    }
  }

  const sourcePublicDirectory = join(import.meta.dir, "..", "src", "public",);
  const sourceViewsDirectory = join(import.meta.dir, "..", "src", "views",);
  const destinationPublicDirectory = join(import.meta.dir, "..", "dist", "public",);

  // Helper: check if source is newer than destination
  function needsCompression(srcDir: string, destDir: string,): boolean {
    if (!existsSync(destDir,)) { return true; }
    const srcFiles = walkDirectorySync(srcDir,);
    for (const f of srcFiles) {
      const srcPath = join(srcDir, f,);
      const destPath = join(destDir, f,);
      if (!existsSync(destPath,)) { return true; }
      const srcStat = statSync(srcPath,);
      const destStat = statSync(destPath,);
      if (srcStat.mtimeMs > destStat.mtimeMs) { return true; }
    }
    return false;
  }

  if (existsSync(sourcePublicDirectory,)) {
    copyDirectory(sourcePublicDirectory, destinationPublicDirectory,);
    if (needsCompression(sourcePublicDirectory, destinationPublicDirectory,)) {
      const result = await compressAssets(sourcePublicDirectory, destinationPublicDirectory,);
      if (result.total > 0) {
        logger.info({
          message: "Compressed assets",
          total: result.total,
          bytes: result.originalBytes,
          gz: result.compressedBytes.gz,
          zst: result.compressedBytes.zst,
          br: result.compressedBytes.br,
        },);
      }
    }
  }

  if (existsSync(sourceViewsDirectory,)) {
    copyDirectory(sourceViewsDirectory, destinationPublicDirectory,);
    if (needsCompression(sourceViewsDirectory, destinationPublicDirectory,)) {
      const result = await compressAssets(sourceViewsDirectory, destinationPublicDirectory,);
      if (result.total > 0) {
        logger.info({
          message: "Compressed views",
          total: result.total,
          bytes: result.originalBytes,
          gz: result.compressedBytes.gz,
          zst: result.compressedBytes.zst,
          br: result.compressedBytes.br,
        },);
      }
    }
  }

  // Inject content-hashed filenames into HTML (enables immutable cache for hashed assets).
  // Runs after copyDirectory so newly-copied HTML templates also get hashed references.
  const hashResult = injectContentHashes(destinationPublicDirectory,);
  if (hashResult.replaced > 0) {
    logger.info({
      message: "Hash-injected references",
      replaced: hashResult.replaced,
      skipped: hashResult.skipped,
    },);
  }

  // Pre-compress VitePress docs dist (if built)
  if (existsSync(DOCS_PATH,)) {
    const docsResult = await compressAssets(DOCS_PATH, DOCS_PATH,);
    if (docsResult.total > 0) {
      logger.info({
        message: "Docs compressed",
        total: docsResult.total,
        bytes: docsResult.originalBytes,
        gz: docsResult.compressedBytes.gz,
        zst: docsResult.compressedBytes.zst,
        br: docsResult.compressedBytes.br,
      },);
    }
  }

  // ── Start liveliness probes for managed servers ──────────
  serverManager.startLivenessProbes();

  // ── Hard-exit guard — kills subprocesses at OS level ──
  process.on("exit", () => {
    serverManager.killAllSync();
  },);

  // ── Graceful shutdown ────────────────────────────────────
  const shutdown = async (_signal: string,) => {
    await serverManager.stopAll();
    await unloadAllPlugins();
    const SHUTDOWN_TIMEOUT = 5000;
    const flushed = logger.flush();
    const timer = setTimeout(() => {
      process.stderr.write(`[logger] flush timed out after ${SHUTDOWN_TIMEOUT}ms\n`,);
      process.exit(1,);
    }, SHUTDOWN_TIMEOUT,);
    await flushed;
    clearTimeout(timer,);
    process.exit(0,);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM",),);
  process.on("SIGINT", () => void shutdown("SIGINT",),);
  process.on("SIGHUP", () => void shutdown("SIGHUP",),);

  process.on("uncaughtException", (err,) => {
    try {
      logger.error({ message: "Uncaught exception", error: String(err,), },);
    } catch {
      /* last resort */
    }
    void shutdown("uncaughtException",);
  },);

  process.on("unhandledRejection", (reason,) => {
    try {
      logger.error({ message: "Unhandled rejection", error: String(reason,), },);
    } catch {
      /* last resort */
    }
    void shutdown("unhandledRejection",);
  },);
}

// Only auto-start when executed directly (not imported by tests)
// Bun equivalent of `require.main === module`
const isMainModule = typeof Bun !== "undefined" && (Bun as { main?: string }).main === import.meta.path;
if (isMainModule) {
  await start();
}
