// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Opt-in process-supervisor bootstrap for server startup.
 *
 * The existing `LOOP_LORE_WATCHDOG` flag keeps three modes:
 *   unset       - plain server (default off)
 *   "1"         - supervised child: skip crash handlers, never re-supervise
 *   "supervise" - this process becomes the supervisor and spawns children
 *                 with "1", so startup never recurses.
 */
import { join, resolve, } from "node:path";
import { getDatabase, } from "../../db";
import { createLogger, } from "../../logger";
import { notifyOnCrashThreshold, } from "./notify";
import { DEFAULT_POLICY, } from "./state";
import { createSupervisor, defaultProbe, defaultSpawn, } from "./supervisor";
import { createTransitionWriter, } from "./transition-writer";

/** What the current process does at boot. */
export type WatchdogBootMode = "off" | "child" | "supervisor";

/**
 * Pure boot decision - no process state is read or changed.
 * @param env - process environment or a test double
 * @returns the resolved boot mode
 */
export function watchdogBootMode(
  env: Readonly<Record<string, string | undefined>>,
): WatchdogBootMode {
  if (env.LOOP_LORE_WATCHDOG === "supervise") { return "supervisor"; }
  if (env.LOOP_LORE_WATCHDOG === "1") { return "child"; }
  return "off";
}

/**
 * Run the supervisor in this process until it stops; the caller owns the exit.
 * @throws When the logger or database handle cannot be initialised.
 */
export async function runWatchdogSupervisor(): Promise<number> {
  const rootDir = resolve(import.meta.dir, "../../..",);
  // start.ts only exports start(); index.ts is the runnable entrypoint (and
  // owns the first-boot contention exit code). The ticket original path is stale.
  // ponytail: env-only opt-in; add a config-schema field when operators need file-based enablement.
  const startPath = join(rootDir, "src/server/index.ts",);
  const port = process.env.PORT ?? "3000";
  const healthUrl = process.env.WATCHDOG_HEALTH_URL ?? `http://127.0.0.1:${port}/health/live`;

  const logger = createLogger();
  const writer = createTransitionWriter(getDatabase(), logger,);
  const supervisor = createSupervisor({
    spawn: () => defaultSpawn({ rootDir, startPath, },),
    probe: defaultProbe(healthUrl, DEFAULT_POLICY.probeTimeoutMs,),
    logger,
    onTransition: writer,
    alert: (info,) => {
      logger.fatal("Watchdog stopping after repeated crashes", undefined, { ...info, },);
      void notifyOnCrashThreshold(info,);
    },
  },);

  for (const signal of ["SIGTERM", "SIGINT",] as const) {
    process.on(signal, () => supervisor.stop(signal,),);
  }

  const exitCode = await supervisor.run();
  await writer.flush();
  await logger.flush();
  return exitCode;
}
