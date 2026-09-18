// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { serve, } from "bun";
import { join, } from "node:path";
import { initAgeGate, } from "../age-gate/controller";
import { ensureTlsCerts, } from "../config/cert";
import { loadConfig, } from "../config/load";
import type { Config, } from "../config/schema";
import { getScheduler, } from "../cron";
import { initAnonymousMode, initSmk, } from "../crypto";
import { getDatabase, } from "../db/index";
import { runMigrations, } from "../db/migrate";
import { runSchemaBackfill, } from "../db/schema-backfill";
import { seedDefaultActors, } from "../db/seed";
import { createApp, } from "../elysia-app";
import { initializeProviders, } from "../generation";
import { initDefaultHooks, } from "../generation/hooks";
import { createLogger, getLogger, setGlobalLogger, } from "../logger";
import { applyStoredNsfwConfig, initNsfwRuntimeConfig, } from "../nsfw/runtime-config";
import { loadAllPlugins, unloadAllPlugins, } from "../plugins";
import { applyEnvironmentOverrides, seedConfiguredContent, seedConfiguredUsers, } from "../seeding";
import { ServerExternalManager, } from "../services/server-external-manager";
import { createRequestHandler, handleApiRequest, } from "./handler";
import { initAssetCompression, } from "./init-asset-compression";
import { initBackgroundServices, } from "./init-background-services";
import { createNonApiHandler, } from "./static-files";

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
    const { discoverBackends, backendToConfig, } = await import("../services/sd-discovery");
    const discovered = await discoverBackends({ timeoutMs: 2000, },);
    if (discovered.length > 0) {
      config = {
        ...config,
        generation: {
          ...config.generation,
          providers: {
            ...config.generation.providers,
            sd: Array.from(
              discovered,
              (b,) => backendToConfig(b, b.apiFamily === "comfyui" ? "comfyui-auto" : "sd-server-auto",),
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
  const failedProviders: (typeof healthResults)[number][] = [];
  for (const p of healthResults) {
    if (p.status !== "healthy") { failedProviders.push(p,); }
  }
  const startLogger = getLogger();
  if (failedProviders.length > 0) {
    startLogger.warn("providers unreachable on startup", {
      module: "server",
      failedProviders: Array.from(failedProviders, (p,) => p.name,),
    },);
  } else {
    startLogger.info("all providers healthy", { module: "server", count: healthResults.length, },);
  }

  const database = getDatabase();
  const logger = getLogger();

  // ── Periodic key rotation + telemetry retention ──────────
  // Owned by the cron scheduler (started in createApp below): jobs
  // `crypto.key-rotation-check` and `telemetry.retention`. No raw timers here.

  const serverManager = new ServerExternalManager(logger,);
  const serverLogger = logger.child({ module: "server", },);

  // ── Non-API request handler (views, docs, static files) ──
  const handleNonApiRequest = createNonApiHandler(config.docs,);

  // ── Elysia app (handles routing + transforms) ──────────────
  const app = createApp({
    database,
    config,
    handleNonApiRequest,
    handleApiRequest,
  },);

  // ── Centralized response-header + dynamic-response policies ──
  // Applied to EVERY outgoing response via createRequestHandler.
  const handleRequest = createRequestHandler(app, config, logger, database,);

  // ── Run migrations before serving (ensure DB schema ready) ───
  await runMigrations(database,);
  await runSchemaBackfill(database,);
  await seedDefaultActors(database, config,);
  const effectiveSeeding = applyEnvironmentOverrides(config.seeding,);
  await seedConfiguredUsers(database, { ...config, seeding: effectiveSeeding, },);
  await seedConfiguredContent(database, effectiveSeeding, config.auth.required,);
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

  // ── Watch domain config files for live reload ────────────
  // FSWatcher over `<cwd>/configs/*.toml|*.yaml`; on change, the in-memory
  // Config instance is reloaded via loadConfig() so handlers pick up new values
  // without a process restart. Restart-required keys (REQUIRES_RESTART_KEYS in
  // src/admin/config.ts) still need a full restart — those are surfaced to
  // the admin UI by `GET /api/admin/config-schema`.
  let domainConfigWatcher: { close(): void } | undefined;
  const configsDir = join(process.cwd(), "configs",);
  try {
    const { existsSync, } = await import("node:fs");
    if (existsSync(configsDir,)) {
      const { watchDomainConfigs, stopWatchingDomainConfigs, } = await import("../config/hot-reload");
      domainConfigWatcher = watchDomainConfigs(configsDir, (domain: string, _updated: Config,) => {
        logger.info(`domain config reloaded: ${domain}`, { module: "hot-reload", domain, },);
        // Domain-specific handlers can subscribe here (provider registry,
        // logger transports). The on-disk values are now the source of truth
        // for the next read of `loadConfig()`.
      },);
      (domainConfigWatcher as { __close?: () => void }).__close = () =>
        stopWatchingDomainConfigs(
          domainConfigWatcher as ReturnType<typeof watchDomainConfigs>,
        );
    }
  } catch (error) {
    logger.warn(`failed to start domain config watcher: ${(error as Error).message}`, { module: "hot-reload", },);
  }

  // ── Telemetry retention cleanup ──────────────────────────
  // Owned by the cron scheduler (`telemetry.retention` job, started in
  // createApp). No direct call here.

  // ── Background init (character templates + external AI servers) ──
  await initBackgroundServices(database, config, serverLogger, serverManager,);

  // ── Load all plugins (core → community → local) ──────
  await loadAllPlugins(database,);

  // ── Pre-compress static assets + hash-inject HTML ──────
  await initAssetCompression(logger,);

  // ── Start liveliness probes for managed servers ──────────
  serverManager.startLivenessProbes();

  // ── Hard-exit guard — kills subprocesses at OS level ──
  process.on("exit", () => {
    serverManager.killAllSync();
  },);

  // ── Graceful shutdown ────────────────────────────────────
  const shutdown = async (_signal: string,) => {
    (domainConfigWatcher as { __close?: () => void } | undefined)?.__close?.();
    getScheduler()?.stop();
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
  // SIGHUP is unsupported on Windows — registering a handler there throws at
  // boot. Windows never delivers SIGHUP, so omitting the handler is safe.
  if (process.platform !== "win32") {
    process.on("SIGHUP", () => void shutdown("SIGHUP",),);
  }

  process.on("uncaughtException", (err,) => {
    try {
      // Pass the Error object (not String(err)) so the logger captures the
      // full stack for maxStackBytes post-mortem analysis.
      logger.fatal({ message: "Uncaught exception", }, err,);
    } catch {
      /* last resort */
    }
    void shutdown("uncaughtException",);
  },);

  process.on("unhandledRejection", (reason,) => {
    try {
      const err = reason instanceof Error ? reason : new Error(String(reason,),);
      logger.fatal({ message: "Unhandled rejection", }, err,);
    } catch {
      /* last resort */
    }
    void shutdown("unhandledRejection",);
  },);
}
