// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { serve, } from "bun";
import { join, } from "node:path";
import { initAgeGate, } from "../age-gate/controller";
import { initAssistantQuota, } from "../assistant/quota/engine";
import { flushActiveStore, } from "../async";
import { reconcileInterruptedJobs, } from "../characters/services/emotion-avatar-service/restart-reconcile";
import { ensureTlsCerts, } from "../config/cert";
import { applyConfigChange, initConfigHotApply, onConfigChange, } from "../config/hot-apply";
import { applyHotConfig, } from "../config/hot-apply-consumers";
import { loadConfig, } from "../config/load";
import type { Config, } from "../config/schema";
import { getScheduler, } from "../cron";
import { initAnonymousMode, initSmk, } from "../crypto";
import { getDatabase, } from "../db/index";
import { runDataMigrations, runMigrations, } from "../db/migrate";
import { seedDefaultActors, } from "../db/seed";
import { createApp, } from "../elysia-app";
import { initializeProviders, } from "../generation";
import { initDefaultHooks, } from "../generation/hooks";
import { bindSharedQuotaEngine, } from "../generation/quota-engine";
import { createLogger, getLogger, setGlobalLogger, } from "../logger";
import { applyStoredNsfwConfig, initNsfwRuntimeConfig, } from "../nsfw/runtime-config";
import { loadAllPlugins, unloadAllPlugins, } from "../plugins";
import { applyEnvironmentOverrides, seedConfiguredContent, seedConfiguredUsers, } from "../seeding";
import { ServerExternalManager, } from "../services/server-external-manager";
import { seedDynamicContent, } from "./boot-seed";
import { createRequestHandler, handleApiRequest, } from "./handler";
import { initAssetCompression, } from "./init-asset-compression";
import { initBackgroundServices, } from "./init-background-services";
import { createNonApiHandler, } from "./static-files";
import { createTerminalGateway, type TerminalSocketData, } from "./terminal-ws";
import { isTerminalUpgradeRequest, } from "./terminal-ws-protocol";

/** Exit code for a clean, signal-triggered shutdown. */
const CLEAN_EXIT_CODE = 0;
/** Exit code for a crash-path shutdown (uncaughtException/unhandledRejection):
 * a supervisor must see a non-zero code so the crash is not reported as a
 * clean stop. */
const CRASH_EXIT_CODE = 1;

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
  initAssistantQuota(config.assistant,);
  // Seed the hot-apply snapshot and register live consumers so config edits
  // re-apply without a restart (see src/config/hot-apply.ts).
  initConfigHotApply(config,);
  onConfigChange(applyHotConfig,);
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
  bindSharedQuotaEngine(database,);

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

  // ── Browser PTY terminal (epic approach B) ────────────────
  // Native Bun websocket handler; an Elysia route cannot upgrade under
  // this Bun.serve shape. The gate runs after the readiness check so a
  // booting server still answers 503, never spawns a PTY.
  const terminalGateway = createTerminalGateway({
    config,
    database,
    logger,
    rootDir: process.cwd(),
  },);

  // ── Readiness gate ─────────────────────────────────────────
  // The listener opens before plugins/seeds/assets are loaded, so early
  // traffic would hit unloaded routes or unserved assets. Every request
  // gets 503 until the boot work below finishes, so a readiness probe can
  // tell "booting" from "broken".
  let ready = false;
  const handleGatedRequest = async (
    request: Request,
    server?: Bun.Server<TerminalSocketData>,
  ): Promise<Response | undefined> => {
    if (!ready) {
      return new Response("Server is starting", { status: 503, headers: { "Retry-After": "1", }, },);
    }

    if (server && isTerminalUpgradeRequest(request,)) {
      return terminalGateway.handleTerminalUpgrade(request, server,);
    }

    return handleRequest(request,);
  };

  await runMigrations(database,); // ensure DB schema ready before serving
  await runDataMigrations(database,); // row-level, after schema is final, before seeding
  // Orphaned emotion-avatar jobs from a previous process are terminal, never
  // resumed: mark them failed with an explicit reason and rebuild the
  // in-memory job cache from the durable rows, so no list/status/SSE consumer
  // can observe a zombie `running` job after a restart.
  await reconcileInterruptedJobs(database,);
  await seedDefaultActors(database, config,);
  const effectiveSeeding = applyEnvironmentOverrides(config.seeding,);
  await seedConfiguredUsers(database, { ...config, seeding: effectiveSeeding, },);
  await seedConfiguredContent(database, effectiveSeeding, config.auth.required,);
  await seedDynamicContent(database,); // after user seeding: rows need a real owner_id

  // ── TLS certificates (fail closed) ─────────────────────────
  // Provisioned before any listener starts: when TLS is configured and the
  // certificates cannot be provisioned we fail closed instead of silently
  // downgrading to plaintext.
  const tlsFiles = config.server.tls ? ensureTlsCerts(config.server.tls,) : null;
  if (config.server.tls && !tlsFiles) {
    serverLogger.fatal(
      "TLS is configured but the certificates could not be provisioned — refusing to serve plaintext",
      new Error("TLS certificate provisioning failed",),
      { module: "server", tls: config.server.tls, },
    );

    throw new Error("TLS certificates could not be provisioned — refusing to start without HTTPS",);
  }

  // ── Start HTTP server ──────────────────────────────────────
  const httpServer = serve({
    port: config.server.port,
    hostname: config.server.host,
    fetch: (request, server,) => handleGatedRequest(request, server,),
    websocket: terminalGateway.websocket,
  },);

  serverLogger.info(`HTTP  → http://localhost:${config.server.port}`,);

  // ── HTTPS server (TLS certs configured or auto-generated) ─
  let httpsServer: ReturnType<typeof serve> | undefined;
  if (tlsFiles) {
    const httpsPort = config.server.port + 443;
    httpsServer = serve({
      port: httpsPort,
      hostname: config.server.host,
      tls: { key: Bun.file(tlsFiles.key,), cert: Bun.file(tlsFiles.cert,), },
      fetch: (request, server,) => handleGatedRequest(request, server,),
      websocket: terminalGateway.websocket,
    },);

    serverLogger.info(`HTTPS → https://localhost:${httpsPort}`,);
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
      domainConfigWatcher = watchDomainConfigs(configsDir, (domain: string, updated: Config,) => {
        logger.info(`domain config reloaded: ${domain}`, { module: "hot-reload", domain, },);
        // Diff against the previous snapshot, classify changed paths, and
        // re-apply the hot-applicable ones to live consumers. Restart-required
        // paths are flagged on the change and surfaced by the admin API.
        applyConfigChange(domain, updated,);
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
  const backgroundServices = await initBackgroundServices(database, config, serverLogger, serverManager,);

  // ── Load all plugins (core → community → local) ──────
  // `authRequired` lets the loader warn when a plugin's `requiresAuth` /
  // `permissions` cannot be enforced (solo mode auto-authenticates everyone
  // as the `solo` super-user).
  await loadAllPlugins(database, { authRequired: config.auth.required, },);

  // ── Pre-compress static assets + hash-inject HTML ──────
  await initAssetCompression(logger,);

  // Plugins, seeds and assets are ready — open the traffic gate.
  ready = true;

  // ── Start liveliness probes for managed servers ──────────
  serverManager.startLivenessProbes();

  // ── Hard-exit guard — kills subprocesses at OS level ──
  process.on("exit", () => {
    serverManager.killAllSync();
  },);

  // ── Graceful shutdown ────────────────────────────────────
  const shutdown = async ({ exitCode, }: { exitCode: number },): Promise<void> => {
    (domainConfigWatcher as { __close?: () => void } | undefined)?.__close?.();
    backgroundServices.stop();
    getScheduler()?.stop();
    await flushActiveStore();
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
    process.exit(exitCode,);
  };

  /** Run the graceful shutdown, guaranteeing a rejected shutdown step (a
   *  stuck store flush or plugin unload) still exits the process instead of
   *  surfacing an unhandled rejection from inside the signal / fatal-error
   * @param opts
   *  handlers below. */
  function runShutdown({ signal, exitCode, }: { signal: string; exitCode: number },): void {
    shutdown({ exitCode, },).catch((err,) => {
      process.stderr.write(`[shutdown] ${signal} failed: ${String(err,)}\n`,);
      process.exit(1,);
    },);
  }

  process.on("SIGTERM", () => runShutdown({ signal: "SIGTERM", exitCode: CLEAN_EXIT_CODE, },),);
  process.on("SIGINT", () => runShutdown({ signal: "SIGINT", exitCode: CLEAN_EXIT_CODE, },),);
  // SIGHUP is unsupported on Windows — registering a handler there throws at
  // boot. Windows never delivers SIGHUP, so omitting the handler is safe.
  if (process.platform !== "win32") {
    process.on("SIGHUP", () => runShutdown({ signal: "SIGHUP", exitCode: CLEAN_EXIT_CODE, },),);
  }

  process.on("uncaughtException", (err,) => {
    try {
      // Pass the Error object (not String(err)) so the logger captures the
      // full stack for maxStackBytes post-mortem analysis.
      logger.fatal({ message: "Uncaught exception", }, err,);
    } catch {
      /* last resort */
    }

    runShutdown({ signal: "uncaughtException", exitCode: CRASH_EXIT_CODE, },);
  },);

  process.on("unhandledRejection", (reason,) => {
    try {
      const err = reason instanceof Error ? reason : new Error(String(reason,),);
      logger.fatal({ message: "Unhandled rejection", }, err,);
    } catch {
      /* last resort */
    }

    runShutdown({ signal: "unhandledRejection", exitCode: CRASH_EXIT_CODE, },);
  },);
}
