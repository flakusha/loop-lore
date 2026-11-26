// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * stdio-server-main.test.ts — the inbound LSP stdio server production
 * entrypoint (`main`).
 *
 * `main` resolves its own config + database + harness seams, so those are
 * pinned with `mock.module` doubles (ISOLATED-only: per-file module
 * registry) while the handler graph under test stays real. The refused boot
 * (disabled harness) and the admitted boot (stdio attach + ready log) run
 * here; everything between initialize and exit is covered by
 * stdio-server.test.ts against the same graph.
 *
 * Resource contract: no database, no ports, no child process. The admitted
 * boot attaches `process.stdin` listeners that never fire (no input flows)
 * and `process.exitCode` is restored in a finally, so a failed test cannot
 * poison siblings.
 */

import { afterEach, beforeEach, expect, mock, test, } from "bun:test";
import type { Config, } from "../../config/schema";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { main, } from "./stdio-server";

const logCalls: { level: string; message: string }[] = [];
const fakeLogger = new Proxy({}, {
  get: (_target: unknown, level: string | symbol,) => (...args: unknown[]) => {
    logCalls.push({ level: String(level,), message: typeof args[0] === "string" ? args[0] : "", },);
    // Chainable (getLogger().child(...) in migrate.ts et al).
    return fakeLogger;
  },
},);

let mainConfig: Config | null = null;
let bootRuntime: unknown = null;

if (ISOLATED) {
  mock.module("../../logger", () => ({
    createLogger: () => fakeLogger,
    getLogger: () => fakeLogger,
    setGlobalLogger: () => {},
    getChildLogger: () => null,
    LoggerImpl: class {},
  }),);

  mock.module("../../config/load", () => ({
    loadConfig: () => {
      if (mainConfig === null) { throw new Error("stdio-server-main.test: mainConfig not seeded",); }
      return mainConfig;
    },
  }),);

  mock.module("../../db/index", () => ({
    getDatabase: () => ({}),
  }),);

  mock.module("../harness/admin-settings", () => ({
    initHarnessAdminSettings: () => {},
    applyStoredHarnessSettings: async () => {},
    getHarnessAdminFileConfig: () => ({ profiles: [], }),
  }),);

  mock.module("../harness/runtime", () => ({
    initHarnessRuntime: () => {},
    getHarnessRuntime: () => bootRuntime,
  }),);
}

describeOrSkip("inbound LSP stdio server main()", () => {
  beforeEach(() => {
    logCalls.length = 0;
    bootRuntime = null;
    // Disabled harness: main refuses the boot before touching stdio.
    mainConfig = { harness: { acp: { enabled: false, profiles: [], }, }, } as unknown as Config;
  },);

  afterEach(() => {
    mainConfig = null;
    bootRuntime = null;
  },);

  test("the disabled harness refuses the boot with exit code 1", async () => {
    const prevExitCode = process.exitCode ?? 0;
    let exitCodeAfter: string | number | null | undefined;
    try {
      await main();
      exitCodeAfter = process.exitCode;
    } finally {
      process.exitCode = prevExitCode;
    }

    expect(exitCodeAfter,).toBe(1,);
    expect(logCalls.some((call,) => call.level === "warn" && call.message.includes("refused to start",)),).toBe(true,);
  });

  test("an enabled harness attaches stdio and logs ready", async () => {
    bootRuntime = {};
    const prevExitCode = process.exitCode ?? 0;
    let exitCodeAfter: string | number | null | undefined;
    try {
      await main();
      exitCodeAfter = process.exitCode;
    } finally {
      process.stdin.removeAllListeners("data",);
      process.stdin.removeAllListeners("end",);
      process.exitCode = prevExitCode;
    }

    expect(exitCodeAfter,).toBe(prevExitCode,);
    expect(logCalls.some((call,) => call.level === "info" && call.message.includes("ready",)),).toBe(true,);
  });
},);
