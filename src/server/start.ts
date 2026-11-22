// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 315
import { serve, } from "bun";
import { join, } from "node:path";
import { initAgeGate, } from "../age-gate/controller";
import { initAssistantQuota, } from "../assistant/quota/engine";
import { reconcileInterruptedJobs, } from "../characters/services/emotion-avatar-service/restart-reconcile";
import { ensureTlsCerts, } from "../config/cert";
import { applyConfigChange, initConfigHotApply, onConfigChange, } from "../config/hot-apply";
import { applyHotConfig, } from "../config/hot-apply-consumers";
import { loadConfig, } from "../config/load";
import type { Config, } from "../config/schema";
import { resolveDbPath, setEffectiveServerBind, } from "../config/state-dir";
import { initAnonymousMode, initSmk, } from "../crypto";
import { getDatabase, } from "../db/index";
import { runDataMigrations, runMigrations, } from "../db/migrate";
import { seedDefaultActors, } from "../db/seed";
import { createApp, } from "../elysia-app";
import { initializeProviders, } from "../generation";
import { initDefaultHooks, } from "../generation/hooks";
import { bindSharedQuotaEngine, } from "../generation/quota-engine";
import { applyStoredHarnessSettings, initHarnessAdminSettings, } from "../integrations/harness/admin-settings";
import { applyStoredInboundSettings, initInboundSettings, } from "../integrations/inbound/settings";
import { maybeStartStdioProxyListener, } from "../integrations/inbound/stdio-proxy-listener";
import { runBootIntegrityGate, } from "../integrity/boot";
import { createLogger, getLogger, setGlobalLogger, } from "../logger";
import { applyStoredNsfwConfig, initNsfwRuntimeConfig, } from "../nsfw/runtime-config";
import { loadAllPlugins, } from "../plugins";
import { configureDocsNav, } from "../routes/views/layout";
import {
  applyEnvironmentOverrides,
  seedConfiguredContent,
  seedConfiguredUsers,
  seedHarnessModelCapabilities,
} from "../seeding";
import { ServerExternalManager, } from "../services/server-external-manager";
import { resolveBindHost, } from "./bind-host";
import { seedDynamicContent, } from "./boot-seed";
import { createRequestHandler, handleApiRequest, } from "./handler";
import { initAssetCompression, } from "./init-asset-compression";
import { initBackgroundServices, } from "./init-background-services";
import { registerShutdownHandlers, } from "./shutdown";
import { createNonApiHandler, } from "./static-files";
import { createTerminalGateway, type TerminalSocketData, } from "./terminal-ws";
import { isTerminalUpgradeRequest, } from "./terminal-ws-protocol";

import {
  applyStoredRepoAccessSettings,
  initRepoAccessSettings,
} from "../integrations/harness/repo-access";

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { initHarnessTurnQueue, } from "../integrations/harness/queue";
import { getHarnessRuntime, initHarnessRuntime, } from "../integrations/harness/runtime";

/** Warn loudly when BYOK is on but no master secret can seal stored keys. */
function warnByokWithoutSecret(config: Config, logger: ReturnType<typeof getLogger>,): void {
  if (config.byoKey?.enabled && !config.byoKey.encryptionKey) {
    logger.warn("BYOK enabled without byoKey.encryptionKey; stored keys cannot be sealed", {
      module: "server",
    },);
  }
}

/**
 * Bootstrap the Loop Lore HTTP/HTTPS server: init subsystems, seed the DB,
 * pre-compress static assets, load plugins, and wire graceful shutdown.
 */
/** Provider instance name for an auto-discovered SD backend by API family. */
function autoProviderName(apiFamily: string,): string {
  if (apiFamily === "comfyui") { return "comfyui-auto"; }
  if (apiFamily === "sdcpp") { return "sdcpp-auto"; }
  return "sd-server-auto";
}

export async function start() {
  // Bootstrap logger before config load (template expansion needs it)
  createLogger();
  let config = loadConfig();
  // Pin the effective server bind before any path resolution so the DB and
  // runtime instance dirs derive the same slug (explicit args still win).
  setEffectiveServerBind(config.server,);
  setGlobalLogger(createLogger(config.logging,),);
  initAgeGate(config.ageGate,);
  initNsfwRuntimeConfig(config.nsfw,);
  // `loadConfig` omits the harness section entirely when unconfigured (the
  // schema default does not materialize it) — seed an empty section so the
  // admin settings store still reads as "disabled, no profiles", and compose
  // the outbound ACP runtime from the same snapshot (a disabled config
  // composes nothing; both take effect on restart).
  const harnessAcp = config.harness?.acp ?? { enabled: false, profiles: [], };
  initHarnessAdminSettings(harnessAcp,);
  initHarnessRuntime(harnessAcp,);
  // Inbound MCP/ACP studio servers (§3.3): seed the effective-settings store
  // from the file layer. Deny-by-default — an omitted `integrations.inbound`
  // section seeds as "disabled, no principal", so the stdio entrypoints
  // refuse to serve until the operator configures it.
  initInboundSettings(
    config.integrations?.inbound ?? {
      mcpEnabled: false,
      acpEnabled: false,
      principalUserId: "",
      principalScope: "read",
      // Loopback default mirrors the schema default; remote bind is refused
      // by the proxy listener, not defaulted here.
      proxyBind: "127.0.0.1",
    },
  );

  // RSI repo-access tier: seeded from the file layer only (absent = off);
  // the operator's stored admin override re-applies below, after the DB
  // opens. Disabled by default; never auto-enabled.
  initRepoAccessSettings(config.harness?.repoAccess,);

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
            sd: Array.from(discovered, (b,) => backendToConfig(b, autoProviderName(b.apiFamily,),),),
          },
        },
      };
    }
  }

  initializeProviders(config,);
  initDefaultHooks();

  const database = getDatabase(resolveDbPath(process.env, config.server,),);
  const logger = getLogger();
  bindSharedQuotaEngine(database,);

  // Federation budgets live in in-process counters: reload the persisted rows
  // before the first peer-work request can reach the admission guard.
  if (config.federation?.enabled === true) {
    const { reloadPerformanceQuota, } = await import("../federation/performance-quota-store");
    await reloadPerformanceQuota({ database, enabled: true, },);
  }

  // ── Periodic key rotation + telemetry retention ──────────
  // Owned by the cron scheduler (started in createApp below): jobs
  // `crypto.key-rotation-check` and `telemetry.retention`. No raw timers here.

  const serverManager = new ServerExternalManager(logger,);
  const serverLogger = logger.child({ module: "server", },);

  // ── Non-API request handler (views, docs, static files) ──
  // Same resolved docs config drives /docs/ and the sidebar link.
  configureDocsNav(config.docs?.enabled !== false,);
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
  // Unclean-shutdown detection + startup integrity gate. On a fail verdict
  // this enters safe mode; the central request gate then rejects writes.
  // Best-effort fs + a bounded PRAGMA quick_check; never blocks boot.
  runBootIntegrityGate(serverLogger,);

  // Startup health check — scan after the schema exists so the boot scan
  // populates model_capabilities before the first request.
  const { scanAllProviders, } = await import("../admin/provider-health");
  const healthResults = await scanAllProviders(database,);
  const failedProviders: (typeof healthResults)[number][] = [];
  for (const p of healthResults) {
    if (p.status !== "healthy") { failedProviders.push(p,); }
  }

  const startLogger = getLogger();
  warnByokWithoutSecret(config, startLogger,);
  // The boot verdict is emitted once, after the stored-provider rescan below,
  // so failures from both scans aggregate into a single structured warning.

  // Orphaned emotion-avatar jobs from a previous process are terminal, never
  // resumed: mark them failed with an explicit reason and rebuild the
  // in-memory job cache from the durable rows, so no list/status/SSE consumer
  // can observe a zombie `running` job after a restart.
  await reconcileInterruptedJobs(database,);
  await seedDefaultActors(database, config,);
  await seedHarnessModelCapabilities(database,); // codex/* + claude/* enrichment rows (idempotent)
  const effectiveSeeding = applyEnvironmentOverrides(config.seeding,);
  await seedConfiguredUsers(database, { ...config, seeding: effectiveSeeding, },);
  await seedConfiguredContent(database, effectiveSeeding, config.auth.required,);
  await seedDynamicContent(database,); // after user seeding: rows need a real owner_id

  // ── TLS certificates (fail closed) ─────────────────────────
  // Provisioned before any listener starts: when TLS is configured and the
  // certificates cannot be provisioned we fail closed instead of silently
  // downgrading to plaintext. Provisioning throws a classified error naming
  // OpenSSL and the platform install hint — propagate it verbatim.
  let tlsFiles: ReturnType<typeof ensureTlsCerts> = null;
  if (config.server.tls) {
    try {
      tlsFiles = ensureTlsCerts(config.server.tls,);
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error,),);
      serverLogger.fatal(
        `TLS is configured but the certificates could not be provisioned — refusing to serve plaintext. ${failure.message}`,
        failure,
        { module: "server", tls: config.server.tls, },
      );

      throw new Error(
        `TLS certificates could not be provisioned — refusing to start without HTTPS. ${failure.message}`,
      );
    }
  }

  if (config.server.tls && !tlsFiles) {
    serverLogger.fatal(
      "TLS is configured but the certificates could not be provisioned — refusing to serve plaintext",
      new Error("TLS certificate provisioning failed",),
      { module: "server", tls: config.server.tls, },
    );

    throw new Error("TLS certificates could not be provisioned — refusing to start without HTTPS",);
  }

  // ── Bind address (one family, pinned) ───────────────────────
  // Bun resolves the host name itself and binds the FIRST address it gets:
  // a second instance on the same port then binds the NEXT address of the
  // same name instead of failing — a silent split across address families.
  // Resolving once and pinning one literal makes the second instance
  // collide with EADDRINUSE and land in the port-conflict path.
  const bindAddress = await resolveBindHost({ host: config.server.host, },);

  // ── Start HTTP server ──────────────────────────────────────
  const httpServer = serve({
    port: config.server.port,
    hostname: bindAddress,
    fetch: (request, server,) => handleGatedRequest(request, server,),
    websocket: terminalGateway.websocket,
  },);

  serverLogger.info(`HTTP  → http://${bindAddress}:${httpServer.port}`,);

  // ── HTTPS server (TLS certs configured or auto-generated) ─
  let httpsServer: ReturnType<typeof serve> | undefined;
  if (tlsFiles) {
    const httpsPort = config.server.port + 443;
    httpsServer = serve({
      port: httpsPort,
      hostname: bindAddress,
      tls: { key: Bun.file(tlsFiles.key,), cert: Bun.file(tlsFiles.cert,), },
      fetch: (request, server,) => handleGatedRequest(request, server,),
      websocket: terminalGateway.websocket,
    },);

    serverLogger.info(`HTTPS → https://${bindAddress}:${httpsServer.port}`,);
  }

  serverLogger.info(`Docs  → http://${bindAddress}:${httpServer.port}/docs/`,);

  // Admin — seed system config defaults + wire DB log transport
  const { seedDefaults, } = await import("../admin/config");
  await seedDefaults(database, config,);
  // Apply persisted admin NSFW overrides (if any) so the toggle survives restart.
  await applyStoredNsfwConfig(database,);
  // Same for the harness admin settings (ACP enable + ToS acknowledgements).
  await applyStoredHarnessSettings(database,);
  // Same for the inbound MCP/ACP studio settings (server switches + principal).
  await applyStoredInboundSettings(database,);
  // Repo-access tier override (default-deny when no stored row exists).
  await applyStoredRepoAccessSettings(database,);

  // ── Harness turn queue (TASK-harness-multi-agent-turn-queue) ────────
  // Composed only when the ACP integration is enabled (the same gate as
  // initHarnessRuntime): a disabled integration leaves the singleton unset
  // and the admin surface reads 503 — inert, never auto-anything. init runs
  // crash recovery first (a turn found `running` died with the previous
  // process → failed `interrupted`), then pumps, so `queued` rows left by a
  // previous process resume here; the dispatch gate re-judges every turn at
  // run time under the enqueueing principal.
  if (harnessAcp.enabled) {
    initHarnessTurnQueue({ database, runtime: getHarnessRuntime, },);
  }

  // Materialize operator-entered provider instances (system_config) into the
  // registry so a wizard-created provider exists before `ready = true` and
  // survives a restart.
  const { materializeServerProviders, } = await import("../generation/providers/server-provider-store");
  await materializeServerProviders(database, config,);

  // Stored/wizard-created providers only enter the registry at materialize
  // time, so rescan now to give them a boot health verdict and populate
  // model_capabilities. Reuses the scanAllProviders binding from this scope.
  const rescanResults = await scanAllProviders(database,);
  for (const p of rescanResults) {
    if (p.status !== "healthy") { failedProviders.push(p,); }
  }

  // Configured providers appear in both scans; report each name once.
  const failedProviderNames = Array.from(new Set(failedProviders.map((p,) => p.name),),);
  const providerCount = new Set([...healthResults, ...rescanResults,].map((p,) => p.name),).size;

  if (failedProviders.length > 0) {
    startLogger.warn("providers unreachable on startup", {
      module: "server",
      failedProviders: failedProviderNames,
    },);
  } else {
    startLogger.info("all providers healthy", {
      module: "server",
      count: providerCount,
    },);
  }

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

  // ── stdio-proxy listener (Design B) ──────────────────────────
  // Local-only relay target for `--proxy` stdio shims (see
  // maybeStartStdioProxyListener): starts only when an inbound server is
  // enabled, and never reads stdio itself.
  const stdioProxy = await maybeStartStdioProxyListener(database, config,);

  // One-line boot readiness summary (TASK-boot-readiness-summary): check ids
  // + ok/off only, never values, hints, or paths. The promotion field reports
  // ensureFirstBootPiiSecrets' actual outcome (via its last-outcome register),
  // never re-inferred env flags. Dynamic import keeps the boot graph lazy
  // like the provider/materialize imports above.
  try {
    const { setupChecks, } = await import("../routes/setup/checks");
    const { buildBootReadinessSummary, } = await import("./boot-readiness");
    const { getLastFirstBootPromotion, } = await import("../config/load/first-boot");
    serverLogger.info(
      buildBootReadinessSummary(await setupChecks(config, database,), getLastFirstBootPromotion(),),
    );
  } catch {
    serverLogger.info("setup readiness: unknown (checks unavailable)",);
  }

  // ── Start liveliness probes for managed servers ──────────
  serverManager.startLivenessProbes();

  // ── Shutdown wiring ───────────────────────────────────────
  registerShutdownHandlers({
    domainConfigWatcher,
    backgroundServices,
    serverManager,
    stdioProxy,
    httpServer,
    httpsServer,
    logger,
  }, {
    // Under supervision an uncaught exception must stay a hard crash so the
    // watchdog sees the non-zero exit. Signal-triggered clean exits are intact.
    installCrashHandlers: process.env.LOOP_LORE_WATCHDOG !== "1",
  },);
}
