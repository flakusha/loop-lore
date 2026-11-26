// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Production boot/shutdown wiring for the integrity watchdog. Kept out of
 * start.ts (size-capped) and shutdown.ts; both call these thin helpers.
 */
import { getSqliteDatabase, } from "../db/index";
import type { Logger, } from "../logger/types";
import {
  clearRunning,
  defaultIntegrityPaths,
  type IntegrityResult,
  runStartupIntegrityGate,
} from "./crash-recovery";
import { createNodeSentinelFs, } from "./node-fs";
import { createSqliteIntegrityChecker, } from "./sqlite-check";

/** Run the startup integrity gate against the live DB + instance paths. */
export function runBootIntegrityGate(logger: Logger,): IntegrityResult | null {
  const sqlite = getSqliteDatabase();
  if (!sqlite) {
    logger.warn("integrity gate skipped: no sqlite handle", { module: "integrity", },);
    return null;
  }

  return runStartupIntegrityGate({
    fs: createNodeSentinelFs(),
    paths: defaultIntegrityPaths(),
    checker: createSqliteIntegrityChecker(sqlite,),
    logger,
  },);
}

/** Remove the boot sentinel on a clean shutdown. Best-effort. */
export function clearBootSentinel(): void {
  clearRunning(createNodeSentinelFs(), defaultIntegrityPaths().sentinel,);
}
