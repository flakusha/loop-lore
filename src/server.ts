// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { existsSync, readdirSync, readFileSync, statSync, } from "node:fs";

import { serve, } from "bun";
import { spawnSync, } from "node:child_process";
import { join, normalize, } from "node:path";
import { initAgeGate, } from "./age-gate/controller";
import { ensureTlsCerts, } from "./config/cert";
import { loadConfig, } from "./config/load";
import { compressAssets, copyDirectory, } from "./content/compress";
import { injectContentHashes, } from "./content/hash-injection";
import { initAnonymousMode, initSmk, } from "./crypto";
import { getDatabase, } from "./db/index";
import { runMigrations, } from "./db/migrate";
import { seedDefaultActors, } from "./db/seed";
import { createApp, } from "./elysia-app";
import { initializeProviders, OpenAiCompatibleProvider, registerProvider, } from "./generation";
import { initDefaultHooks, } from "./generation/hooks";
import { createLogger, getLogger, setGlobalLogger, } from "./logger";
import { DynamicResponsePolicy, ResponseHeaderPolicy, } from "./middleware";
import { generateNonce, } from "./middleware/csp-nonce";
import { dispatchPluginRoute, loadAllPlugins, unloadAllPlugins, } from "./plugins";
import { backendToConfig, discoverBackends, } from "./services/sd-discovery";
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
    // Generate a unique request ID for traceability
    const requestId = crypto.randomUUID();
    // Attach request ID to the cloned request so downstream handlers can read it
    const headers = new Headers(request.headers,);
    headers.set("x-request-id", requestId,);
    const taggedRequest = new Request(request, { headers, },);
    generateNonce(taggedRequest,);
    let response = await app.fetch(taggedRequest,);
    // Return the request ID in the response header
    response.headers.set("X-Request-Id", requestId,);
    response = await dynamicPolicy.apply({ request: taggedRequest, response, },);
    response = headerPolicy.apply({ request: taggedRequest, response, },);
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

async function start() {
  // Bootstrap logger before config load (template expansion needs it)
  createLogger();
  let config = loadConfig();
  setGlobalLogger(createLogger(config.logging,));
  initAgeGate(config.ageGate,);
  await initSmk(config.encryption,);
  initAnonymousMode(config,);

  // ── Auto-discover SD backends if not configured ──────────
  if (!config.generation.providers.sd || config.generation.providers.sd.length === 0) {
    const discovered = await discoverBackends({ timeoutMs: 2000, },);
    if (discovered.length > 0) {
      config = {
        ...config,
        generation: {
          ...config.generation,
          providers: {
            ...config.generation.providers,
            sd: discovered.map((b,) =>
              backendToConfig(b, b.apiFamily === "comfyui" ? "comfyui-auto" : "sd-server-auto",)
            ),
          },
        },
      };
    }
  }

  initializeProviders(config,);
  initDefaultHooks();

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

  // ── Auto-key rotation timer ────────────────────────────────
  const { startAutoRotationTimer, } = await import("./crypto/key-rotation");
  const rotationTimer = startAutoRotationTimer(
    database,
    config.encryption.keyRotationDays ?? 0,
  );

  // Clean up timer on shutdown
  process.on("SIGTERM", () => {
    if (rotationTimer) { clearInterval(rotationTimer,); }
  },);
  process.on("SIGINT", () => {
    if (rotationTimer) { clearInterval(rotationTimer,); }
  },);

  const serverManager = new ServerExternalManager(logger,);
  const serverLogger = logger.child({ module: "server", },);

  // ── Non-API request handler (views, docs, static files) ──
  const handleNonApiRequest = async (request: Request,): Promise<Response> => {
    const url = new URL(request.url,);

    const docsResult = handleDocsRequest(url, request, config,);
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

  // ── Elysia app (handles routing + transforms) ──────────────
  const app = createApp({
    database,
    config,
    handleNonApiRequest,
  },);

  // ── Centralized response-header + dynamic-response policies ──
  // Applied to EVERY outgoing response via createRequestHandler.
  const handleRequest = createRequestHandler(app, config, logger,);

  // ── Run migrations before serving (ensure DB schema ready) ───
  await runMigrations(database,);
  await seedDefaultActors(database, config,);

  // ── Start HTTP server ──────────────────────────────────────
  const httpServer = serve({ port: config.server.port, fetch: handleRequest, },);
  serverLogger.info(`HTTP  → http://localhost:${config.server.port}`,);

  // ── HTTPS server (TLS certs configured or auto-generated) ─
  let httpsServer: ReturnType<typeof serve> | undefined;
  if (config.server.tls) {
    const tlsFiles = ensureTlsCerts(config.server.tls,);
    if (tlsFiles) {
      const httpsPort = config.server.port + 443;
      httpsServer = serve({
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

  // Admin — seed system config defaults + wire DB log transport
  const { seedDefaults, } = await import("./admin/config");
  await seedDefaults(database, config,);

  if (config.logging.dbEnabled) {
    const { DBTransport, } = await import("./logger/transports/db");
    logger.addTransport(new DBTransport(database,),);
  }

  // ── Background initialization (non-blocking) ─────────────
  const initPromises: Promise<void>[] = [];

  // Seed character templates from config (idempotent)
  if (config.characters.enabled) {
    initPromises.push(
      (async () => {
        const { seedCharacterTemplates, mergeCharacterTemplates, } = await import("./characters/seed");
        const { CHARACTERS_DEFAULTS, } = await import("./config/sections/characters");

        // Use character templates from template loader (configs/templates/character.yaml)
        // Merge built-in defaults with template-loaded characters
        const templateCharacters = config.templates.character.templates;
        const mergedTemplates = mergeCharacterTemplates(
          CHARACTERS_DEFAULTS.templates,
          templateCharacters,
        );

        const mergedConfig = { ...config.characters, templates: mergedTemplates, };
        const result = await seedCharacterTemplates(database, mergedConfig,);
        if (result.created > 0) {
          logger.info("character templates seeded", {
            module: "server",
            created: result.created,
            skipped: result.skipped,
          },);
        }
        if (result.errors.length > 0) {
          logger.warn("character template seeding had errors", { module: "server", errors: result.errors, },);
        }
      })(),
    );
  }

  // Auto-start external AI servers (llama.cpp, sd.cpp) in background
  const autoStart = config.generation.autoStart;
  if (autoStart) {
    const llamaCppCfg = autoStart?.llamaCpp;
    if (llamaCppCfg?.enabled) {
      serverLogger.info("auto-starting llama.cpp", { module: "server", port: llamaCppCfg.port, },);
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
      serverLogger.info("auto-starting llama-swap", {
        module: "server",
        configPath: llamaSwapCfg.configPath,
      },);
      initPromises.push(
        (async () => {
          const instance = await serverManager.startLlamaSwap({ configPath: llamaSwapCfg.configPath, },);
          if (instance) {
            serverLogger.info(`llama-swap ready → http://127.0.0.1:${instance.port}`,);
          } else {
            serverLogger.warn("llama-swap auto-start failed or skipped", { module: "server", },);
          }
        })(),
      );
    }
    const sdCppCfg = autoStart?.sdCpp;
    if (sdCppCfg?.enabled) {
      serverLogger.info("auto-starting sd-cpp", { module: "server", port: sdCppCfg.port, },);
      initPromises.push(
        (async () => {
          const instance = await serverManager.startSdCpp(sdCppCfg,);
          if (!instance) {
            serverLogger.warn("sd-cpp auto-start failed or skipped", { module: "server", },);
          }
        })(),
      );
    }
  } else {
    serverLogger.debug("autoStart not configured — skipping external server launch", { module: "server", },);
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

  // ── Pre-compress static assets (parallel, graceful on failure) ──
  const compressionJobs: { label: string; src: string; dest: string }[] = [];
  if (existsSync(sourcePublicDirectory,)) {
    copyDirectory(sourcePublicDirectory, destinationPublicDirectory,);
    if (needsCompression(sourcePublicDirectory, destinationPublicDirectory,)) {
      compressionJobs.push({ label: "public", src: sourcePublicDirectory, dest: destinationPublicDirectory, });
    }
  }
  if (existsSync(sourceViewsDirectory,)) {
    copyDirectory(sourceViewsDirectory, destinationPublicDirectory,);
    if (needsCompression(sourceViewsDirectory, destinationPublicDirectory,)) {
      compressionJobs.push({ label: "views", src: sourceViewsDirectory, dest: destinationPublicDirectory, });
    }
  }
  if (existsSync(DOCS_PATH,)) {
    compressionJobs.push({ label: "docs", src: DOCS_PATH, dest: DOCS_PATH, });
  }

  if (compressionJobs.length > 0) {
    const promises: Promise<void>[] = [];
    for (const job of compressionJobs) {
      promises.push(
        (async () => {
          const result = await compressAssets(job.src, job.dest,);
          if (result.total > 0) {
            logger.info({
              message: `Compressed ${job.label}`,
              total: result.total,
              bytes: result.originalBytes,
              gz: result.compressedBytes.gz,
              zst: result.compressedBytes.zst,
              br: result.compressedBytes.br,
            },);
          }
        })(),
      );
    }
    const results = await Promise.allSettled(promises,);
    for (const r of results) {
      if (r.status === "rejected") {
        logger.warn({ message: "Asset compression failed", error: String(r.reason), },);
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
    httpServer.stop();
    httpsServer?.stop();
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
