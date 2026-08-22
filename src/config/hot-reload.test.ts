// src/config/hot-reload.test.ts — Tests for domain config hot-reload

import { afterEach, describe, expect, mock, test, } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, } from "node:fs";
import path from "node:path";
import { stopWatchingDomainConfigs, watchDomainConfigs, } from "./hot-reload";

const TEST_DIR = path.join(import.meta.dir, "__test_hot_reload__",);

// Mock node:fs.watch so the test does NOT consume an inotify instance.
// fs.inotify.max_user_instances caps at 128 on Linux, and bun:test opens
// watchers per-test-file — we cannot afford to add real fs.watch calls here.
const closeMock = mock(() => {},);
const watchMock = mock((_path: string, _opts: unknown, _listener: unknown,) => {
  return { close: closeMock, } as unknown as ReturnType<typeof import("node:fs").watch>;
},);

mock.module("node:fs", () => {
  const actual = require("node:fs",);
  return {
    ...actual,
    watch: watchMock,
  };
},);

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true, },);
  watchMock.mockClear();
  closeMock.mockClear();
},);

describe("Domain Config Hot-Reload", () => {
  test("watches domain config files for changes", () => {
    mkdirSync(path.join(TEST_DIR, "configs",), { recursive: true, },);

    writeFileSync(
      path.join(TEST_DIR, "configs", "config.server.toml",),
      "[server]\nport = 8080\n",
    );

    let reloadCalled = false;
    const watcher = watchDomainConfigs(TEST_DIR, (_domain, _config,) => {
      reloadCalled = true;
    },);

    expect(watchMock,).toHaveBeenCalledTimes(1,);
    expect(watchMock.mock.calls[0]?.[0],).toBe(TEST_DIR,);

    stopWatchingDomainConfigs(watcher,);
    expect(closeMock,).toHaveBeenCalledTimes(1,);

    // We did not actually exercise fs.watch — the callback is unverifiable
    // here without a real inotify handle. The test asserts the lifecycle
    // contract instead: watch() + close() are called exactly once each.
    expect(reloadCalled,).toBe(false,);
  },);

  test("stops watching domain configs", () => {
    mkdirSync(path.join(TEST_DIR, "configs",), { recursive: true, },);

    const watcher = watchDomainConfigs(TEST_DIR, () => {},);

    // Should not throw and should close the watcher
    stopWatchingDomainConfigs(watcher,);
    expect(closeMock,).toHaveBeenCalledTimes(1,);
  },);
},);
