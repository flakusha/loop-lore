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
      "chat.archive-expiration",
      "async.offload",
      "crypto.key-rotation-check",
      "memory.decay",
      "memory.purge",
      "federation.gossip",
      "federation.resync",
      "federation.outbox-drain",
      "federation.storage-reconcile",
      "providers.health-rescan",
      "autonomy.world-tick",
      "locations.tick",
      "chat.scheduled",
      "nsfw.status-sweep",
      "models.rankings-prune",
      "models.news-poll",
      "models.reaction-grade",
      "models.global-import",
    ],);

    for (const job of jobs) {
      expect(Bun.cron.parse(job.schedule,),).not.toBeNull();
    }
  });

  // Two network-backed jobs (news-poll, global-import) hit live feeds;
  // stub fetch with 500s everywhere so the catalog test asserts job
  // wiring success, not feed reachability (covered per-feed in
  // news.test.ts / boards-importers.test.ts with body fixtures).
  test("every job runOnce succeeds against a migrated db", async () => {
    const failingFetch = async (_url: string | URL | Request,) => new Response("offline", { status: 500, },);
    const priorFetch = globalThis.fetch;
    globalThis.fetch = failingFetch as typeof fetch;
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
      globalThis.fetch = priorFetch;
      scheduler.stop();
    }
  });
});

describe("federation jobs", () => {
  test("gossip and resync run enabled against an empty registry", async () => {
    const { db, } = await createTestDb();
    const config = {
      ...configSchema.defaults,
      server: { ...configSchema.defaults.server, host: "localhost", port: 1, },
      federation: {
        enabled: true,
        seeds: [],
        peers: [],
        meshPsk: "",
        duplication: { mode: "trusted" as const, peers: [], },
      },
    };

    const scheduler = startScheduler({
      database: db,
      config,
      logger: createLogger({ level: "fatal", },),
      jobs: defaultJobs(),
      cronImpl: () => stubFactory(),
    },);

    try {
      const gossip = await scheduler.runOnce("federation.gossip",) as { tick: number };
      expect(gossip.tick,).toBe(1,);
      const resync = await scheduler.runOnce("federation.resync",);
      expect(resync,).toEqual({ checked: 0, alive: 0, expired: 0, },);
    } finally {
      scheduler.stop();
    }
  });
});
