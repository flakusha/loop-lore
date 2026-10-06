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
  mock.module("../db/index", () => ({ getDatabase: () => fakeDb, }),);
  mock.module("../db/migrate", () => ({ runDataMigrations: async () => {}, runMigrations: async () => {}, }),);
  mock.module("../db/seed", () => ({ seedDefaultActors: async () => {}, }),);
  mock.module("../elysia-app", () => ({ createApp: () => fakeApp, }),);
  mock.module("../generation", () => ({ initializeProviders: () => {}, }),);
  mock.module("../generation/hooks", () => ({ initDefaultHooks: () => {}, }),);
  mock.module("../logger", () => ({
    createLogger: () => fakeLogger,
    getLogger: () => fakeLogger,
    setGlobalLogger: () => {},
  }),);

  mock.module("../nsfw/runtime-config", () => ({
    applyStoredNsfwConfig: async () => {},
    initNsfwRuntimeConfig: () => {},
    updateRuntimeNsfwConfig: () => {},
  }),);

  mock.module("../plugins", () => ({ loadAllPlugins: async () => {}, unloadAllPlugins: async () => {}, }),);
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
  mock.module("./init-background-services", () => ({ initBackgroundServices: async () => {}, }),);
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
},);
