// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import type { Config, } from "../config/schema";
import { configSchema, } from "../config/schema-class";
import type { Db, } from "../db";
import { createLogger, getLogger, } from "../logger";
import { defineJob, getScheduler, startScheduler, } from "./registry";
import type { CronFactory, CronHandle, CronJobDef, } from "./types";

createLogger({ level: "fatal", },);

interface Captured {
  expression: string;
  callback: () => unknown;
  handle: { stopped: boolean; unrefed: boolean };
}

/** */
function makeFactory(captured: Captured[],): CronFactory {
  return (expression, callback,) => {
    const handle = { stopped: false, unrefed: false, };
    const entry: Captured = { expression, callback, handle, };
    captured.push(entry,);
    const cronHandle: CronHandle = {
      stop: () => {
        handle.stopped = true;
        return cronHandle;
      },
      ref: () => cronHandle,
      unref: () => {
        handle.unrefed = true;
        return cronHandle;
      },
    };
    return cronHandle;
  };
}

/** */
function makeDeps(overrides: {
  jobs?: CronJobDef[];
  cronImpl?: CronFactory;
  cronConfig?: Config["cron"];
} = {},):
  & { database: Db; config: Config; logger: ReturnType<typeof getLogger> }
  & Pick<typeof overrides, "jobs" | "cronImpl">
{
  const config = { ...configSchema.defaults, cron: overrides.cronConfig ?? { enabled: true, jobs: {}, }, };
  return {
    database: {} as Db,
    config,
    logger: getLogger(),
    ...(overrides.jobs ? { jobs: overrides.jobs, } : {}),
    ...(overrides.cronImpl ? { cronImpl: overrides.cronImpl, } : {}),
  };
}

describe("cron registry", () => {
  test("starts enabled jobs unrefed, skips disabled", () => {
    const captured: Captured[] = [];
    const scheduler = startScheduler(makeDeps({
      cronImpl: makeFactory(captured,),
      jobs: [
        defineJob({ name: "a.on", schedule: "@hourly", enabled: true, run: async () => "ok", },),
        defineJob({ name: "b.off", schedule: "@hourly", enabled: false, run: async () => "ok", },),
      ],
    },),);
    try {
      expect(captured.length,).toBe(1,);
      expect(captured[0]?.expression,).toBe("@hourly",);
      expect(captured[0]?.handle.unrefed,).toBe(true,);
      const status = scheduler.getStatus();
      expect(status.find((s,) => s.name === "a.on")?.enabled,).toBe(true,);
      expect(status.find((s,) => s.name === "b.off")?.enabled,).toBe(false,);
      expect(status.find((s,) => s.name === "a.on")?.nextRunAt,).not.toBeNull();
      expect(status.find((s,) => s.name === "b.off")?.nextRunAt,).toBeNull();
    } finally {
      scheduler.stop();
    }
  });

  test("runOnce executes, tracks status, and fires scheduled callbacks", async () => {
    const captured: Captured[] = [];
    const seen: string[] = [];
    const scheduler = startScheduler(makeDeps({
      cronImpl: makeFactory(captured,),
      jobs: [
        defineJob({
          name: "a.job",
          schedule: "@hourly",
          enabled: true,
          run: async () => {
            seen.push("ran",);
            return 42;
          },
        },),
      ],
    },),);
    try {
      const result = await scheduler.runOnce("a.job",);
      expect(result,).toBe(42,);
      await captured[0]?.callback();
      expect(seen.length,).toBe(2,);
      const [entry,] = scheduler.getStatus();
      expect(entry?.runCount,).toBe(2,);
      expect(entry?.lastRunAt,).not.toBeNull();
      expect(entry?.lastError,).toBeNull();
    } finally {
      scheduler.stop();
    }
  });

  test("runOnce failure records lastError and rethrows; fire-path swallows", async () => {
    const captured: Captured[] = [];
    const scheduler = startScheduler(makeDeps({
      cronImpl: makeFactory(captured,),
      jobs: [
        defineJob({
          name: "a.flaky",
          schedule: "@hourly",
          enabled: true,
          run: async () => {
            throw new Error("boom",);
          },
        },),
      ],
    },),);
    try {
      await expect(scheduler.runOnce("a.flaky",),).rejects.toThrow("boom",);
      await captured[0]?.callback();
      const [entry,] = scheduler.getStatus();
      expect(entry?.lastError,).toContain("boom",);
      expect(entry?.runCount,).toBe(0,);
      await expect(scheduler.runOnce("nope",),).rejects.toThrow("Unknown cron job",);
    } finally {
      scheduler.stop();
    }
  });

  test("rejects unknown overrides and invalid schedules", () => {
    const captured: Captured[] = [];
    expect(() =>
      startScheduler(makeDeps({
        cronImpl: makeFactory(captured,),
        jobs: [defineJob({ name: "a.ok", schedule: "@hourly", enabled: true, run: async () => {}, },),],
        cronConfig: { enabled: true, jobs: { "typo.name": { enabled: true, }, }, },
      },),)
    ).toThrow("Unknown cron job override",);
    expect(() =>
      startScheduler(makeDeps({
        cronImpl: makeFactory(captured,),
        jobs: [defineJob({ name: "a.bad", schedule: "not-a-schedule", enabled: true, run: async () => {}, },),],
      },),)
    ).toThrow("Invalid cron schedule",);
  });

  test("config overrides schedule and enabled; master switch disables all", () => {
    const captured: Captured[] = [];
    const on = startScheduler(makeDeps({
      cronImpl: makeFactory(captured,),
      jobs: [defineJob({ name: "a.job", schedule: "@hourly", enabled: true, run: async () => {}, },),],
      cronConfig: { enabled: true, jobs: { "a.job": { schedule: "@daily", }, }, },
    },),);
    try {
      expect(captured[0]?.expression,).toBe("@daily",);
    } finally {
      on.stop();
    }
    const capturedOff: Captured[] = [];
    const off = startScheduler(makeDeps({
      cronImpl: makeFactory(capturedOff,),
      jobs: [defineJob({ name: "a.job", schedule: "@hourly", enabled: true, run: async () => {}, },),],
      cronConfig: { enabled: false, jobs: {}, },
    },),);
    try {
      expect(capturedOff.length,).toBe(0,);
      expect(off.getStatus()[0]?.enabled,).toBe(false,);
    } finally {
      off.stop();
    }
  });

  test("stop halts handles and unpublishes the scheduler", () => {
    const captured: Captured[] = [];
    const scheduler = startScheduler(makeDeps({
      cronImpl: makeFactory(captured,),
      jobs: [defineJob({ name: "a.job", schedule: "@hourly", enabled: true, run: async () => {}, },),],
    },),);
    expect(getScheduler(),).toBe(scheduler,);
    scheduler.stop();
    expect(captured[0]?.handle.stopped,).toBe(true,);
    expect(getScheduler(),).toBeNull();
  });

  test("unref:false jobs stay refed", () => {
    const captured: Captured[] = [];
    const scheduler = startScheduler(makeDeps({
      cronImpl: makeFactory(captured,),
      jobs: [defineJob({ name: "a.ref", schedule: "@hourly", enabled: true, unref: false, run: async () => {}, },),],
    },),);
    try {
      expect(captured[0]?.handle.unrefed,).toBe(false,);
    } finally {
      scheduler.stop();
    }
  });
});
