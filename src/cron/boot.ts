// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Config, } from "../config/schema";
import type { Db, } from "../db";
import { createLogger, getLogger, } from "../logger";
import type { Logger, } from "../logger/types";
import { defaultJobs, } from "./jobs";
import { startScheduler, } from "./registry";
import type { Scheduler, } from "./types";

/** */
export interface AppSchedulerDeps {
  database: Db;
  config: Config;
  logger?: Logger;
}

/**
 * Resolve the scheduler logger: explicit dep wins, else the global root,
 * else a quiet error-level instance (scripts that never init logging).
 * @param explicit
 */
function resolveLogger(explicit?: Logger,): Logger {
  if (explicit) { return explicit; }
  try {
    return getLogger();
  } catch {
    return createLogger({ level: "error", },);
  }
}

/**
 * Start the internal scheduler with the default job catalog: offload scan
 * (replaces startOffloadDaemon), telemetry retention, key-rotation checks,
 * memory decay/purge, and provider rescans. Jobs are unref'd
 * minute-granularity timers — safe to start under e2e servers and invisible
 * to unit tests (never imported there).
 * @param deps
 */
export function startAppScheduler(deps: AppSchedulerDeps,): Scheduler {
  return startScheduler({
    database: deps.database,
    config: deps.config,
    logger: resolveLogger(deps.logger,),
    jobs: defaultJobs(),
  },);
}
