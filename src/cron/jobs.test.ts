// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { configSchema, } from "../config/schema-class";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { defaultJobs, } from "./jobs";
import { startScheduler, } from "./registry";
import type { CronHandle, } from "./types";

createLogger({ level: "fatal", },);

/** Inert handle: jobs never fire on a timer in tests; `runOnce` drives runs. */
function stubFactory(): CronHandle {
  const handle: CronHandle = {
    stop: () => handle,
    ref: () => handle,
    unref: () => handle,
  };
  return handle;
}

describe("cron default jobs", () => {
  test("catalog names and schedules are valid", () => {
    const jobs = defaultJobs();
    expect(jobs.map((j,) => j.name),).toEqual([
      "telemetry.retention",
      "async.offload",
      "crypto.key-rotation-check",
      "memory.decay",
      "memory.purge",
      "providers.health-rescan",
    ],);
    for (const job of jobs) {
      expect(Bun.cron.parse(job.schedule,),).not.toBeNull();
    }
  });

  test("every job runOnce succeeds against a migrated db", async () => {
    const { db, } = await createTestDb();
    const scheduler = startScheduler({
      database: db,
      config: configSchema.defaults,
      logger: createLogger({ level: "fatal", },),
      jobs: defaultJobs(),
      cronImpl: () => stubFactory(),
    },);
    try {
      for (const job of defaultJobs()) {
        await scheduler.runOnce(job.name,);
      }
      const statuses = scheduler.getStatus();
      expect(statuses.every((s,) => s.runCount === 1 && s.lastError === null),).toBe(true,);
    } finally {
      scheduler.stop();
    }
  });
});
