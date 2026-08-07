// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { existsSync, statSync, } from "node:fs";
import { serve, } from "bun";
import { spawnSync, } from "node:child_process";
import { join, } from "node:path";
import { initAgeGate, } from "../age-gate/controller";
import { ensureTlsCerts, } from "../config/cert";
import { loadConfig, } from "../config/load";
import { compressAssets, copyDirectory, } from "../content/compress";
import { injectContentHashes, } from "../content/hash-injection";
import { initAnonymousMode, initSmk, } from "../crypto";
import { getDatabase, } from "../db/index";
import { runMigrations, } from "../db/migrate";
import { seedDefaultActors, } from "../db/seed";
import { createApp, } from "../elysia-app";
import { initializeProviders, OpenAiCompatibleProvider, registerProvider, } from "../generation";
import { initDefaultHooks, } from "../generation/hooks";
import { createLogger, getLogger, setGlobalLogger, } from "../logger";
import { applyStoredNsfwConfig, initNsfwRuntimeConfig, } from "../nsfw/runtime-config";
import { loadAllPlugins, unloadAllPlugins, } from "../plugins";
import { backendToConfig, discoverBackends, } from "../services/sd-discovery";
import { ServerExternalManager, } from "../services/server-external-manager";
import { createRequestHandler, } from "./handler";
import { createNonApiHandler, DOCS_PATH, walkDirectorySync, } from "./static-files";

/**
 * Bootstrap the Loop Lore HTTP/HTTPS server: init subsystems, seed the DB,
 * pre-compress static assets, load plugins, and wire graceful shutdown.
 */
export async function start() {
  // Bootstrap logger before config load (template expansion needs it)
  createLogger();
  let config = loadConfig();
  setGlobalLogger(createLogger(config.logging,),);
  initAgeGate(config.ageGate,);
  initNsfwRuntimeConfig(config.nsfw,);
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
  const { scanAllProviders, } = await import("../admin/provider-health");
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
  const { startAutoRotationTimer, } = await import("../crypto/key-rotation");
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
  const handleNonApiRequest = createNonApiHandler(config.docs,);

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
  const { seedChatSetupTemplates, } = await import("../chat/service");
  await seedChatSetupTemplates(database,);

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
  const { seedDefaults, } = await import("../admin/config");
  await seedDefaults(database, config,);
  // Apply persisted admin NSFW overrides (if any) so the toggle survives restart.
  await applyStoredNsfwConfig(database,);

  if (config.logging.dbEnabled) {
    const { DBTransport, } = await import("../logger/transports/db");
    logger.addTransport(new DBTransport(database,),);
  }

  // ── Telemetry retention cleanup (startup + every 24h) ────
  const { startRetentionCleanup, } = await import("../telemetry/cleanup");
  startRetentionCleanup(database,);

  // ── Background initialization (non-blocking) ─────────────
  const initPromises: Promise<void>[] = [];

  // Seed character templates from config (idempotent)
  if (config.characters.enabled) {
    initPromises.push(
      (async () => {
        const { seedCharacterTemplates, mergeCharacterTemplates, } = await import("../characters/seed");
        const { CHARACTERS_DEFAULTS, } = await import("../config/sections/characters");

        // Use character templates from template loader (configs/templates/character.yaml)
        // Merge built-in defaults with template-loaded characters
        const templateCharacters = config.templates.character.templates;
        const mergedTemplates = mergeCharacterTemplates(
          CHARACTERS_DEFAULTS.templates,
          templateCharacters,
        );

        const mergedConfig = { ...config.characters, templates: mergedTemplates, };
        const result = await seedCharacterTemplates(database, mergedConfig, null, config.assets.uploadDir,);
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
  const distPublic = join(import.meta.dir, "..", "..", "dist", "public",);
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

  const sourcePublicDirectory = join(import.meta.dir, "..", "..", "src", "public",);
  const sourceViewsDirectory = join(import.meta.dir, "..", "..", "src", "views",);
  const destinationPublicDirectory = join(import.meta.dir, "..", "..", "dist", "public",);

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
      compressionJobs.push({ label: "public", src: sourcePublicDirectory, dest: destinationPublicDirectory, },);
    }
  }
  if (existsSync(sourceViewsDirectory,)) {
    copyDirectory(sourceViewsDirectory, destinationPublicDirectory,);
    if (needsCompression(sourceViewsDirectory, destinationPublicDirectory,)) {
      compressionJobs.push({ label: "views", src: sourceViewsDirectory, dest: destinationPublicDirectory, },);
    }
  }
  if (existsSync(DOCS_PATH,)) {
    compressionJobs.push({ label: "docs", src: DOCS_PATH, dest: DOCS_PATH, },);
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
        logger.warn({ message: "Asset compression failed", error: String(r.reason,), },);
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
