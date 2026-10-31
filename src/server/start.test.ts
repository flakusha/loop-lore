// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/server/start.test.ts — Server bootstrap (start.ts).
//
// start() pulls in ~28 modules and calls Bun.serve() directly. The "bun"
// module cannot be mocked (mock.module("bun") is a no-op in Bun), so this
// suite mocks every OTHER dependency and lets the real HTTP server run on a
// free port. The server is verified with a real HTTP request.

import { serve, } from "bun";
import { afterEach, beforeEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../test-utils/isolate-only";

// ── Mutable config ───────────────────────────────────────────

let currentConfig: Record<string, unknown> = {
  logging: { dbEnabled: false, },
  ageGate: {},
  nsfw: {},
  encryption: {},
  generation: { providers: { sd: [], }, },
  server: { port: 0, host: "127.0.0.1", tls: undefined, },
  docs: {},
  seeding: {},
  auth: { required: false, },
};

const processOnCalls: [string, (...args: unknown[]) => void,][] = [];

// Gate for the plugin loader: a test can hold `loadAllPlugins` open to observe
// the boot window (traffic must stay gated until the plugins are loaded).
let pluginGate: Promise<void> | undefined;

// ── Module mocks (everything except "bun") ──────────────────

if (ISOLATED) {
  const fakeLogger = {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
    child: () => fakeLogger,
    addTransport: () => {},
    setBindings: () => {},
    flush: async () => {},
  };

  const fakeDb = {};
  const fakeApp = {};
  const fakeHandler = () => new Response("ok",);
  // `config/hot-apply-consumers` reaches this module too and calls
  // `ageGateConfig.update()` when an `ageGate.*` hot path changes, so the
  // stub has to expose the store as well as `initAgeGate` — a mock that only
  // stubs `initAgeGate` breaks module linking for every importer.
  mock.module("../age-gate/controller", () => ({
    ageGateConfig: { update: () => {}, },
    initAgeGate: () => {},
  }),);

  mock.module("../config/cert", () => ({ ensureTlsCerts: () => null, }),);
  mock.module("../config/load", () => ({ loadConfig: () => currentConfig, }),);
  mock.module("../cron", () => ({ getScheduler: () => ({ stop: () => {}, }), }),);
  mock.module("../crypto", () => ({ initAnonymousMode: () => {}, initSmk: async () => {}, }),);
  mock.module("../db/index", () => ({ getDatabase: () => fakeDb, getSqliteDatabase: () => null, }),);
  mock.module("../db/migrate", () => ({ runDataMigrations: async () => {}, runMigrations: async () => {}, }),);
  mock.module("../db/seed", () => ({ seedDefaultActors: async () => {}, }),);
  mock.module(
    "../characters/services/emotion-avatar-service/restart-reconcile",
    () => ({ reconcileInterruptedJobs: async () => ({ cached: 0, interrupted: 0, }), }),
  );

  mock.module("../elysia-app", () => ({ createApp: () => fakeApp, }),);
  mock.module("../generation", () => ({ initializeProviders: () => {}, }),);
  mock.module("../generation/hooks", () => ({ initDefaultHooks: () => {}, }),);
  mock.module("../logger", () => ({
    createLogger: () => fakeLogger,
    getLogger: () => fakeLogger,
    // 60+ modules import getChildLogger (several in this graph — assets,
    // guard pipeline, generation). A mock without it breaks module linking
    // for every importer under --isolate (SyntaxError: export not found).
    getChildLogger: () => fakeLogger,
    setGlobalLogger: () => {},
  }),);

  // `config/hot-apply-consumers` imports the file-layer writer too, so the
  // mock has to expose it — a mock that only stubs the override writer
  // breaks module linking for every importer.
  mock.module("../nsfw/runtime-config", () => ({
    applyStoredNsfwConfig: async () => {},
    initNsfwRuntimeConfig: () => {},
    updateRuntimeNsfwConfig: () => {},
    updateRuntimeNsfwFileConfig: () => {},
  }),);

  mock.module("../plugins", () => ({
    loadAllPlugins: async () => {
      if (pluginGate) { await pluginGate; }
    },
    unloadAllPlugins: async () => {},
  }),);

  mock.module("../seeding", () => ({
    applyEnvironmentOverrides: (cfg: unknown,) => cfg,
    seedConfiguredContent: async () => {},
    seedConfiguredUsers: async () => {},
  }),);

  mock.module("../services/server-external-manager", () => ({
    ServerExternalManager: class {
      constructor(..._args: unknown[]) {}
      startLivenessProbes() {}
      killAllSync() {}
      async stopAll() {}
    },
  }),);

  mock.module("./boot-seed", () => ({ seedDynamicContent: async () => {}, }),);
  mock.module("./handler", () => ({ createRequestHandler: () => fakeHandler, handleApiRequest: fakeHandler, }),);
  mock.module("./init-asset-compression", () => ({ initAssetCompression: async () => {}, }),);
  mock.module("./init-background-services", () => ({
    initBackgroundServices: async () => ({ stop: () => {}, }),
  }),);

  mock.module("./static-files", () => ({ createNonApiHandler: () => fakeHandler, }),);

  // Dynamic imports inside start()
  mock.module("../services/sd-discovery", () => ({
    discoverBackends: async () => [],
    backendToConfig: () => ({}),
  }),);

  mock.module("../admin/provider-health", () => ({ scanAllProviders: async () => [], }),);
  mock.module("../admin/config", () => ({ seedDefaults: async () => {}, }),);
  mock.module("../logger/transports/db", () => ({ DBTransport: class {}, }),);
  mock.module("../config/hot-reload", () => ({
    watchDomainConfigs: () => ({ close() {}, __close() {}, }),
    stopWatchingDomainConfigs: () => {},
  }),);
}

const { start, } = await import("./start");

// ── Free-port helper ────────────────────────────────────────

function findFreePort(): number {
  const server = serve({ port: 0, fetch: () => new Response("",), },);
  const port = server.port;
  server.stop(true,);
  return port!;
}

async function fetchWithRetry(url: string, retries = 20,): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url,);
    } catch {
      await new Promise((resolve,) => setTimeout(resolve, 50,));
    }
  }

  throw new Error(`server did not start at ${url}`,);
}

/** Wait until `condition` holds — the shutdown path runs several async steps. */
async function waitFor(condition: () => boolean,): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (condition()) { return; }
    await new Promise((resolve,) => setTimeout(resolve, 10,));
  }

  throw new Error("condition not met",);
}

// ── process.on capture ───────────────────────────────────────

const originalOn = process.on.bind(process,);

beforeEach(() => {
  processOnCalls.length = 0;
  process.on = ((event: string, handler: (...args: unknown[]) => void,) => {
    processOnCalls.push([event, handler,],);
    return process;
  }) as typeof process.on;
},);

afterEach(() => {
  process.on = originalOn;
},);

// ── Tests ────────────────────────────────────────────────────

describeOrSkip("start", () => {
  test("starts the HTTP server and serves requests", async () => {
    const port = findFreePort();
    currentConfig = { ...currentConfig, server: { port, host: "127.0.0.1", tls: undefined, }, };
    await start();
    const res = await fetchWithRetry(`http://127.0.0.1:${port}/`,);
    expect(await res.text(),).toBe("ok",);
  });

  test("registers graceful-shutdown process handlers", async () => {
    const port = findFreePort();
    currentConfig = { ...currentConfig, server: { port, host: "127.0.0.1", tls: undefined, }, };
    await start();
    const events = processOnCalls.map(([event,],) => event);
    expect(events,).toContain("SIGTERM",);
    expect(events,).toContain("SIGINT",);
    expect(events,).toContain("exit",);
    expect(events,).toContain("uncaughtException",);
    expect(events,).toContain("unhandledRejection",);
  });

  test("gates traffic with 503 until the plugins are loaded", async () => {
    const port = findFreePort();
    currentConfig = { ...currentConfig, server: { port, host: "127.0.0.1", tls: undefined, }, };
    let release: () => void = () => {};
    pluginGate = new Promise<void>((resolve,) => {
      release = resolve;
    },);

    const started = start();
    try {
      // The listener is up but the boot work is not done → traffic is refused.
      const booting = await fetchWithRetry(`http://127.0.0.1:${port}/`,);
      expect(booting.status,).toBe(503,);

      release();
      pluginGate = undefined;
      await started;

      const ready = await fetchWithRetry(`http://127.0.0.1:${port}/`,);
      expect(ready.status,).toBe(200,);
      expect(await ready.text(),).toBe("ok",);
    } finally {
      pluginGate = undefined;
      release();
      await started.catch(() => {},);
    }
  });

  test("fails closed when the configured TLS certs cannot be provisioned", async () => {
    const port = findFreePort();
    currentConfig = {
      ...currentConfig,
      server: {
        port,
        host: "127.0.0.1",
        tls: { key: "/tmp/loop-lore-test/key.pem", cert: "/tmp/loop-lore-test/cert.pem", },
      },
    };

    await expect(start(),).rejects.toThrow(/TLS certificates could not be provisioned/,);
  });

  test("exits non-zero on a crash-path shutdown and zero on a signal shutdown", async () => {
    const port = findFreePort();
    currentConfig = { ...currentConfig, server: { port, host: "127.0.0.1", tls: undefined, }, };
    await start();

    const exitCodes: number[] = [];
    const originalExit = process.exit;
    const stubExit = (code?: number,): void => {
      exitCodes.push(code ?? 0,);
    };

    process.exit = stubExit as unknown as typeof process.exit;

    try {
      const crash = processOnCalls.find(([event,],) => event === "uncaughtException");
      expect(crash,).toBeDefined();
      crash?.[1](new Error("boom",),);
      await waitFor(() => exitCodes.length > 0);
      expect(exitCodes.at(-1,),).toBe(1,);

      const terminate = processOnCalls.find(([event,],) => event === "SIGTERM");
      expect(terminate,).toBeDefined();
      terminate?.[1]();
      await waitFor(() => exitCodes.length > 1);
      expect(exitCodes.at(-1,),).toBe(0,);
    } finally {
      process.exit = originalExit;
    }
  });
},);
