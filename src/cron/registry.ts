// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/cron/registry.ts — Central registry for internal scheduled jobs.
//
// Replaces ad-hoc `setInterval` timers with named `Bun.cron` schedules:
// single lifecycle (start/stop), per-run status, and an error wrapper so a
// failing job is logged + recorded instead of killing the process.

import type { CronFactory, CronJobDef, JobContext, JobStatusEntry, Scheduler, SchedulerDeps, } from "./types";

/** Default factory — annotated so the `Bun.cron` overloads resolve to the callback form. */
const defaultCron: CronFactory = (expression, callback, opts,) => Bun.cron(expression, callback, opts,);

interface LiveJob {
  def: CronJobDef;
  schedule: string;
  enabled: boolean;
  handle: { stop(): void } | null;
  lastRunAt: string | null;
  lastError: string | null;
  runCount: number;
}

/**
 * Declare a job. Applies `unref: true` default; validation happens at
 * `startScheduler` time (unknown schedule → throw with the job name).
 * @param def
 */
export function defineJob(def: CronJobDef,): CronJobDef {
  return { unref: true, ...def, };
}

/**
 * Validate a schedule now — `Bun.cron.parse` throws on malformed input and
 * returns null when it cannot compute a next fire time.
 * @param name
 * @param schedule
 */
function assertValidSchedule(name: string, schedule: string,): void {
  let parsed: Date | null = null;
  try {
    parsed = Bun.cron.parse(schedule,);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error,);
    throw new Error(`Invalid cron schedule for job "${name}": ${schedule} (${reason})`,);
  }
  if (parsed === null) {
    throw new Error(`Invalid cron schedule for job "${name}": ${schedule}`,);
  }
}

/**
 * Start all enabled jobs. Unknown job names in `config.cron.jobs` are
 * rejected loudly — a typo'd override must fail at boot, not silently idle.
 * Publishes itself via `setScheduler` so admin routes can reach it.
 * @param deps
 */
export function startScheduler(deps: SchedulerDeps,): Scheduler {
  const { database, config, logger, } = deps;
  const cronImpl: CronFactory = deps.cronImpl ?? defaultCron;
  const defs = deps.jobs ?? [];
  const masterEnabled = config.cron.enabled !== false;
  const overrides = config.cron.jobs ?? {};

  const unknown = Object.keys(overrides,).filter((name,) => !defs.some((d,) => d.name === name));
  if (unknown.length > 0) {
    throw new Error(`Unknown cron job override(s): ${unknown.join(", ",)}`,);
  }

  const live = new Map<string, LiveJob>();

  /** */
  async function invoke(job: LiveJob, ctx: JobContext,): Promise<unknown> {
    try {
      const result = await job.def.run(ctx,);
      job.lastRunAt = new Date().toISOString();
      job.lastError = null;
      job.runCount += 1;
      return result;
    } catch (error: unknown) {
      job.lastError = String(error,);
      ctx.logger.error(`cron job failed: ${job.def.name}`, undefined, { error: String(error,), },);
      throw error;
    }
  }

  for (const def of defs) {
    const override = overrides[def.name] ?? {};
    const enabled = masterEnabled && (override.enabled ?? def.enabled);
    const schedule = override.schedule ?? def.schedule;
    const job: LiveJob = {
      def,
      schedule,
      enabled,
      handle: null,
      lastRunAt: null,
      lastError: null,
      runCount: 0,
    };
    live.set(def.name, job,);
    if (!enabled) { continue; }

    assertValidSchedule(def.name, schedule,);
    const ctx: JobContext = {
      database,
      config,
      logger: logger.child({ module: `cron:${def.name}`, },),
    };
    const handle = cronImpl(schedule, () => {
      void invoke(job, ctx,).catch(() => {
        // Recorded + logged in invoke(); must not escape into the scheduler.
      },);
    },);
    if (def.unref !== false) { handle.unref(); }
    job.handle = handle;
    logger.info(`cron job scheduled: ${def.name}`, { module: "cron", schedule, },);
  }

  const getStatus = (): JobStatusEntry[] =>
    Array.from(live.values(), (job,) => ({
      name: job.def.name,
      schedule: job.schedule,
      enabled: job.enabled,
      lastRunAt: job.lastRunAt,
      nextRunAt: job.enabled ? (Bun.cron.parse(job.schedule,)?.toISOString() ?? null) : null,
      lastError: job.lastError,
      runCount: job.runCount,
    }),);

  const scheduler: Scheduler = {
    stop(): void {
      for (const job of live.values()) {
        job.handle?.stop();
        job.handle = null;
      }
      if (getScheduler() === scheduler) { setScheduler(null,); }
    },
    getStatus,
    async runOnce(name: string,): Promise<unknown> {
      const job = live.get(name,);
      if (!job) { throw new Error(`Unknown cron job: ${name}`,); }
      return invoke(job, {
        database,
        config,
        logger: logger.child({ module: `cron:${name}`, },),
      },);
    },
  };
  setScheduler(scheduler,);
  return scheduler;
}

let activeScheduler: Scheduler | null = null;

/**
 * Publish the live scheduler for admin routes. Called once from app startup.
 * @param scheduler
 */
export function setScheduler(scheduler: Scheduler | null,): void {
  activeScheduler = scheduler;
}

/** Scheduler handle for admin status/trigger endpoints (null when not booted). */
export function getScheduler(): Scheduler | null {
  return activeScheduler;
}
