// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/cron/types.ts — Cron scheduler types

import type { Config, } from "../config/schema";
import type { Db, } from "../db";
import type { Logger, } from "../logger/types";

/** Runtime context threaded into every job run. */
export interface JobContext {
  database: Db;
  config: Config;
  logger: Logger;
}

/** Static definition of a scheduled job. */
export interface CronJobDef {
  /** Stable dotted name, e.g. "telemetry.retention". Matches config override key. */
  name: string;
  /** 5-field POSIX cron expression or nickname (@daily, @hourly, …). */
  schedule: string;
  /** Default-enabled; `config.cron.jobs[name].enabled` overrides. */
  enabled: boolean;
  /** Let the process exit while scheduled (default true — maintenance never blocks shutdown). */
  unref?: boolean;
  /** Unit of work. Throw/reject → recorded + logged, job reschedules. */
  run: (ctx: JobContext,) => Promise<unknown>;
}

/** Observable per-job status for admin + tests. */
export interface JobStatusEntry {
  name: string;
  schedule: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
  runCount: number;
}

/** Minimal handle surface of `Bun.cron()` used by the registry. */
export interface CronHandle {
  stop(): CronHandle;
  ref(): CronHandle;
  unref(): CronHandle;
}

/**
 * Factory for the underlying timer. Defaults to `Bun.cron`; injectable so
 * unit tests never wait on real minute-granularity schedules.
 */
export type CronFactory = (
  expression: string,
  callback: () => void | Promise<void>,
  opts?: { tz?: string },
) => CronHandle;

/** Live scheduler instance. */
export interface Scheduler {
  stop(): void;
  getStatus(): JobStatusEntry[];
  runOnce(name: string,): Promise<unknown>;
}

/** */
export interface SchedulerDeps {
  database: Db;
  config: Config;
  logger: Logger;
  /** Defaults to the built-in job catalog. */
  jobs?: CronJobDef[];
  /** Defaults to `Bun.cron`. */
  cronImpl?: CronFactory;
}
