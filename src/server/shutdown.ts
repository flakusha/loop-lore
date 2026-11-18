// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Server shutdown wiring. Split out of `start.ts` so boot orchestration stays
 * under the strict file-size budget; behavior is unchanged.
 */
import { flushActiveStore, } from "../async";
import { getScheduler, } from "../cron";
import { closeHarnessRuntime, } from "../integrations/harness/runtime";
import { getLogger, } from "../logger";
import { unloadAllPlugins, } from "../plugins";

/** Exit code for a clean, signal-triggered shutdown. */
const CLEAN_EXIT_CODE = 0;
/** Exit code for a crash-path shutdown (a supervisor must see non-zero). */
const CRASH_EXIT_CODE = 1;
/** Logger flush budget before a forced exit. */
const SHUTDOWN_TIMEOUT = 5000;

/** Resources the shutdown path owns and releases, in order. */
export interface ShutdownResources {
  domainConfigWatcher: { close(): void; __close?: () => void } | undefined;
  backgroundServices: { stop: () => void };
  serverManager: { stopAll: () => Promise<void>; killAllSync: () => void };
  stdioProxy: { close: () => Promise<void> } | undefined;
  httpServer: { stop: () => void };
  httpsServer: { stop: () => void } | undefined;
  logger: ReturnType<typeof getLogger>;
}

/** Register hard-exit, signal, and fatal-error shutdown handlers. */
export function registerShutdownHandlers(resources: ShutdownResources,): void {
  const {
    domainConfigWatcher,
    backgroundServices,
    serverManager,
    stdioProxy,
    httpServer,
    httpsServer,
    logger,
  } = resources;

  process.on("exit", () => {
    serverManager.killAllSync();
    closeHarnessRuntime();
  },);

  const shutdown = async ({ exitCode, }: { exitCode: number },): Promise<void> => {
    domainConfigWatcher?.__close?.();
    backgroundServices.stop();
    getScheduler()?.stop();
    await flushActiveStore();
    await serverManager.stopAll();
    closeHarnessRuntime();
    await unloadAllPlugins();
    await stdioProxy?.close();
    httpServer.stop();
    httpsServer?.stop();

    const flushed = logger.flush();
    const timer = setTimeout(() => {
      process.stderr.write(`[logger] flush timed out after ${SHUTDOWN_TIMEOUT}ms\n`,);
      process.exit(1,);
    }, SHUTDOWN_TIMEOUT,);

    await flushed;
    clearTimeout(timer,);
    process.exit(exitCode,);
  };

  /** Run shutdown, guaranteeing a rejected step still exits the process. */
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
