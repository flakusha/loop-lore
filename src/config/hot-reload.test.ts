// src/config/hot-reload.test.ts — Tests for domain config hot-reload
//
// BUG-hot-reload-test-ts-asserts-trivially-true-on-emfile-enoent-c:
// The previous test exercised the watcher via fs.watch on a real directory
// and early-returned on EMFILE/ENOENT without asserting anything meaningful.
//
// Fix: stub node:fs.watch with a controllable fake so the reload callback
// fires synchronously when the test simulates a "change" event. Stub ./load
// so the watcher's reload path resolves with a trivial config object.

import { afterEach, beforeEach, describe, expect, mock, test, } from "bun:test";
import type { FSWatcher, } from "node:fs";
import type { watch as NodeWatch, } from "node:fs";
import { mkdirSync, rmSync, } from "node:fs";
import path from "node:path";

// ── Stubs ────────────────────────────────────────────────────

type Listener = (eventType: string, filename: string | null,) => void;

interface StubWatcher {
  listeners: Listener[];
  closed: boolean;
  close(): void;
}

type WatchFn = typeof NodeWatch;

const stubState: { watchers: StubWatcher[]; failWith: Error | null } = {
  watchers: [],
  failWith: null,
};

const stubWatch: WatchFn = ((_dir: string, _opts: unknown, listener: unknown,) => {
  if (stubState.failWith) {
    const err = stubState.failWith;
    stubState.failWith = null;
    throw err;
  }
  const watcher: StubWatcher = {
    listeners: [listener as Listener,],
    closed: false,
    close() {
      this.closed = true;
    },
  };
  stubState.watchers.push(watcher,);
  return watcher as unknown as FSWatcher;
}) as WatchFn;

mock.module("node:fs", () => {
  const actual = require("node:fs",);
  return { ...actual, watch: stubWatch, };
},);

mock.module("./load", () => ({
  loadConfig: () => ({}),
}),);

const TEST_DIR = path.join(import.meta.dir, "__test_hot_reload__",);

// ── Tests ────────────────────────────────────────────────────

describe("Domain Config Hot-Reload", () => {
  beforeEach(() => {
    mkdirSync(path.join(TEST_DIR, "configs",), { recursive: true, },);
    stubState.watchers = [];
    stubState.failWith = null;
  },);

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true, },);
  },);

  // Hot-reload.ts is imported lazily so the `mock.module(...)` calls above
  // are registered before the import resolves. The dynamic import is the
  // standard bun:test seam for module-mock boundaries; the path is a literal
  // known at author time, not runtime-selected.
  async function loadModule(): Promise<typeof import("./hot-reload")> {
    return await import("./hot-reload");
  }

  test("invokes onReload when a domain config file changes", async () => {
    const { watchDomainConfigs, stopWatchingDomainConfigs, } = await loadModule();

    const reloads: { domain: string }[] = [];
    const watcher = watchDomainConfigs(TEST_DIR, (domain,) => {
      reloads.push({ domain, },);
    },);

    expect(stubState.watchers,).toHaveLength(1,);
    const stub = stubState.watchers[0]!;

    stub.listeners.forEach((l,) => l("change", "config.server.toml",));

    // Watcher's reload path: `void import("./load").then(...)` — dynamic
    // import resolves on the next microtask tick. setImmediate drains all
    // pending microtasks before the macrotask fires.
    const { promise: drained, resolve, } = Promise.withResolvers<void>();
    setImmediate(() => resolve());
    await drained;

    expect(reloads,).toEqual([{ domain: "server", },],);

    stopWatchingDomainConfigs(watcher,);
    expect(stub.closed,).toBe(true,);
  });

  test("ignores non-domain files and routes matching domains", async () => {
    const { watchDomainConfigs, } = await loadModule();

    const domains: string[] = [];
    watchDomainConfigs(TEST_DIR, (domain,) => {
      domains.push(domain,);
    },);
    const stub = stubState.watchers[0]!;

    stub.listeners.forEach((l,) => l("change", "README.md",));
    stub.listeners.forEach((l,) => l("change", "config.database.yaml",));
    stub.listeners.forEach((l,) => l("change", "config.logging.yml",));
    stub.listeners.forEach((l,) => l("change", "config.notadomain.toml",));

    const { promise: drained2, resolve: resolve2, } = Promise.withResolvers<void>();
    setImmediate(() => resolve2());
    await drained2;

    expect(domains,).toEqual(["database", "logging",],);
  });

  test("propagates EMFILE so callers can decide", async () => {
    const { watchDomainConfigs, } = await loadModule();
    stubState.failWith = new Error("EMFILE: too many open files",);

    expect(() => watchDomainConfigs(TEST_DIR, () => {},)).toThrow(/EMFILE/,);
  });

  test("stopWatchingDomainConfigs closes the watcher", async () => {
    const { watchDomainConfigs, stopWatchingDomainConfigs, } = await loadModule();

    const watcher = watchDomainConfigs(TEST_DIR, () => {},);
    expect(stubState.watchers[0]?.closed,).toBe(false,);
    stopWatchingDomainConfigs(watcher,);
    expect(stubState.watchers[0]?.closed,).toBe(true,);
  });
});
