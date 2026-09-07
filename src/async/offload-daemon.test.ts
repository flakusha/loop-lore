// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage for the offload daemon (`startOffloadDaemon` / `runOnce` / `spill`)
 * against a real in-memory SQLite DB.
 *
 * Exercises all three `runOnce()` phases:
 *   1. gzip-spill ripe oversized `complete` rows to disk,
 *   2. mark `complete`/`failed` rows past TTL as `expired`,
 *   3. unlink spill files of long-expired rows.
 */

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { existsSync, mkdirSync, rmSync, writeFileSync, } from "node:fs";
import path from "node:path";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  OFFLOAD_DIR,
  type OffloadDaemon,
  offloadDiskBytes,
  offloadExists,
  readOffloadedBody,
  spill,
  startOffloadDaemon,
} from "./offload";

/** Seed a `request_results` row with explicit lifecycle fields. */
async function seedRequest(
  db: Kysely<DB>,
  opts: {
    id: string;
    status: string;
    completedAt?: string | null;
    responseBody?: string | null;
    offloadedAt?: string | null;
    offloadPath?: string | null;
    userId?: string | null;
  },
): Promise<void> {
  await db
    .insertInto("request_results",)
    .values({
      id: opts.id,
      method: "POST",
      route_pattern: "/api/test",
      user_id: opts.userId ?? null,
      status: opts.status,
      started_at: new Date(Date.now() - 60 * 60 * 1000,).toISOString(),
      completed_at: opts.completedAt ?? null,
      response_body: opts.responseBody ?? null,
      offloaded_at: opts.offloadedAt ?? null,
      offload_path: opts.offloadPath ?? null,
    },)
    .execute();
}

/** Minutes-ago ISO timestamp helper. */
function minutesAgo(min: number,): string {
  return new Date(Date.now() - min * 60 * 1000,).toISOString();
}

/**
 * Await a predicate by bounded polling. Real-timer by design: the offload
 * daemon fires on a genuine setInterval with no fake-timer seam, and the
 * awaited condition here is the observable spill file, never a fixed sleep.
 */
async function waitFor(predicate: () => boolean, opts: { timeoutMs: number; stepMs: number },): Promise<void> {
  const deadline = Date.now() + opts.timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) { throw new Error("waitFor: condition not met before timeout",); }
    const { promise, resolve, } = Promise.withResolvers<void>();
    setTimeout(resolve, opts.stepMs,);
    await promise;
  }
}

describe("spill() disk round-trip", () => {
  const id = "offload-spill-unit";

  test("spill writes a gzip file that offloadExists sees and readOffloadedBody restores", async () => {
    const body = JSON.stringify({ id: "msg-1", content: "spill me", },);
    const filePath = await spill(id, body,);

    expect(filePath,).toBe(path.join(OFFLOAD_DIR, `${id}.json.gz`,),);
    expect(offloadExists(id,),).toBe(true,);
    expect(readOffloadedBody(filePath,),).toBe(body,);
    expect(offloadDiskBytes(),).toBeGreaterThan(0,);
  });

  test("spill is self-sufficient before daemon mkdir (overwrites atomically)", async () => {
    const first = await spill("offload-spill-twice", "first",);
    const second = await spill("offload-spill-twice", "second-payload",);
    expect(second,).toBe(first,);
    expect(readOffloadedBody(second,),).toBe("second-payload",);
  });
});

describe("OffloadDaemon.runOnce — phase 1: offload ripe rows", () => {
  let db: Kysely<DB>;
  let sqlite: { close(): void };
  let filePaths: string[];

  beforeEach(async () => {
    const ctx = await createTestDb();
    db = ctx.db;
    sqlite = ctx.sqlite;
    filePaths = [];
  },);

  afterEach(async () => {
    for (const p of filePaths) { rmSync(p, { force: true, },); }
    await db.destroy();
    sqlite.close();
  },);

  test("spills an oversized ripe row, records the path, and nulls the inline body", async () => {
    await seedRequest(db, {
      id: "big-1",
      status: "complete",
      completedAt: minutesAgo(10,),
      responseBody: "x".repeat(64,),
    },);
    // Small body stays inline.
    await seedRequest(db, {
      id: "small-1",
      status: "complete",
      completedAt: minutesAgo(10,),
      responseBody: "tiny",
    },);
    // Null body is skipped (daemon cannot spill what is not there).
    await seedRequest(db, {
      id: "empty-1",
      status: "complete",
      completedAt: minutesAgo(10,),
      responseBody: null,
    },);
    // Pending rows are never offload candidates.
    await seedRequest(db, {
      id: "pending-1",
      status: "pending",
      completedAt: null,
      responseBody: "x".repeat(64,),
    },);

    const daemon = startOffloadDaemon(db, {}, { minAgeMs: 0, maxInlineBytes: 10, },);
    const result = await daemon.runOnce();

    expect(result.offloaded,).toBe(1,);
    expect(result.expired,).toBe(0,);

    const big = await db
      .selectFrom("request_results",)
      .select(["response_body", "offloaded_at", "offload_path",],)
      .where("id", "=", "big-1",)
      .executeTakeFirst();
    expect(big?.response_body,).toBeNull();
    expect(big?.offload_path,).toBeTypeOf("string",);
    expect(big?.offloaded_at,).toBeTypeOf("string",);
    if (big?.offload_path) { filePaths.push(big.offload_path,); }

    // The spilled file round-trips the original body.
    expect(readOffloadedBody(big?.offload_path ?? "",),).toBe("x".repeat(64,),);

    // Non-candidates keep their inline bodies and status.
    const small = await db
      .selectFrom("request_results",)
      .select(["response_body", "offload_path", "status",],)
      .where("id", "=", "small-1",)
      .executeTakeFirst();
    expect(small?.response_body,).toBe("tiny",);
    expect(small?.offload_path,).toBeNull();
    expect(small?.status,).toBe("complete",);

    const pending = await db
      .selectFrom("request_results",)
      .select("response_body",)
      .where("id", "=", "pending-1",)
      .executeTakeFirst();
    expect(pending?.response_body,).toBe("x".repeat(64,),);

    daemon.stop();
  });

  test("skips rows younger than minAgeMs", async () => {
    await seedRequest(db, {
      id: "fresh-1",
      status: "complete",
      completedAt: minutesAgo(1,),
      responseBody: "x".repeat(64,),
    },);

    const daemon = startOffloadDaemon(db, {}, { minAgeMs: 5 * 60 * 1000, maxInlineBytes: 10, },);
    const result = await daemon.runOnce();

    expect(result.offloaded,).toBe(0,);
    const row = await db
      .selectFrom("request_results",)
      .select("response_body",)
      .where("id", "=", "fresh-1",)
      .executeTakeFirst();
    expect(row?.response_body,).toBe("x".repeat(64,),);
    daemon.stop();
  });

  test("daemon maxInlineBytes override wins over the store config", async () => {
    await seedRequest(db, {
      id: "override-1",
      status: "complete",
      completedAt: minutesAgo(10,),
      responseBody: "y".repeat(20,),
    },);

    // Store config would allow 1024 inline bytes; daemon override forces 10.
    const daemon = startOffloadDaemon(db, { maxInlineBytes: 1024, }, {
      minAgeMs: 0,
      maxInlineBytes: 10,
    },);
    const result = await daemon.runOnce();
    expect(result.offloaded,).toBe(1,);
    daemon.stop();
  });

  test("falls back to the store-config threshold when no daemon override", async () => {
    await seedRequest(db, {
      id: "fallback-1",
      status: "complete",
      completedAt: minutesAgo(10,),
      responseBody: "z".repeat(20,),
    },);
    // No daemon maxInlineBytes → AsyncStoreConfig.maxInlineBytes (10) applies.
    const daemon = startOffloadDaemon(db, { maxInlineBytes: 10, }, { minAgeMs: 0, },);
    const result = await daemon.runOnce();
    expect(result.offloaded,).toBe(1,);
    daemon.stop();
  });

  test("body exactly at the threshold stays inline (<= boundary)", async () => {
    await seedRequest(db, {
      id: "boundary-1",
      status: "complete",

      responseBody: "b".repeat(10,),
    },);

    const daemon = startOffloadDaemon(db, {}, { minAgeMs: 0, maxInlineBytes: 10, },);
    const result = await daemon.runOnce();
    expect(result.offloaded,).toBe(0,);
    const row = await db
      .selectFrom("request_results",)
      .select("response_body",)
      .where("id", "=", "boundary-1",)
      .executeTakeFirst();
    expect(row?.response_body,).toBe("b".repeat(10,),);
    daemon.stop();
  });

  test("logs and skips a row whose id breaks the spill path (no crash)", async () => {
    // A row id containing "/" makes spill() try to write into a missing
    // subdirectory — the daemon must swallow the failure and keep going.
    await seedRequest(db, {
      id: "bad/path",
      status: "complete",
      completedAt: minutesAgo(10,),
      responseBody: "x".repeat(64,),
    },);
    await seedRequest(db, {
      id: "good-1",
      status: "complete",
      completedAt: minutesAgo(10,),
      responseBody: "x".repeat(64,),
    },);

    const daemon = startOffloadDaemon(db, {}, { minAgeMs: 0, maxInlineBytes: 10, },);
    const result = await daemon.runOnce();

    // The broken row failed; the healthy row after it was still offloaded.
    expect(result.offloaded,).toBe(1,);
    const good = await db
      .selectFrom("request_results",)
      .select(["offload_path", "response_body",],)
      .where("id", "=", "good-1",)
      .executeTakeFirst();
    expect(good?.response_body,).toBeNull();
    if (good?.offload_path) {
      filePaths.push(good.offload_path,);
      expect(readOffloadedBody(good.offload_path,),).toBe("x".repeat(64,),);
    }
    const bad = await db
      .selectFrom("request_results",)
      .select("offload_path",)
      .where("id", "=", "bad/path",)
      .executeTakeFirst();
    expect(bad?.offload_path,).toBeNull();
    daemon.stop();
  });
});
describe("OffloadDaemon.runOnce — phase 2: TTL expiry", () => {
  let db: Kysely<DB>;
  let sqlite: { close(): void };

  beforeEach(async () => {
    const ctx = await createTestDb();
    db = ctx.db;
    sqlite = ctx.sqlite;
  },);

  afterEach(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("marks old complete and failed rows expired and nulls their bodies; pending untouched", async () => {
    await seedRequest(db, {
      id: "old-complete",
      status: "complete",
      completedAt: minutesAgo(30,),
      responseBody: "stale-body",
    },);
    await seedRequest(db, {
      id: "old-failed",
      status: "failed",
      completedAt: minutesAgo(30,),
      responseBody: "failed-body",
    },);
    await seedRequest(db, {
      id: "fresh-complete",
      status: "complete",
      completedAt: minutesAgo(0.1,),
      responseBody: "fresh-body",
    },);
    await seedRequest(db, { id: "old-pending", status: "pending", completedAt: minutesAgo(30,), },);

    const daemon = startOffloadDaemon(db, {}, { ttlMs: 60 * 1000, minAgeMs: 0, maxInlineBytes: 10, },);
    const result = await daemon.runOnce();

    expect(result.expired,).toBe(2,);

    const statuses = await db
      .selectFrom("request_results",)
      .select(["id", "status", "response_body",],)
      .execute();
    const byId = new Map(Array.from(statuses, (r,) => [r.id, r,],),);
    expect(byId.get("old-complete",)?.status,).toBe("expired",);
    expect(byId.get("old-complete",)?.response_body,).toBeNull();
    expect(byId.get("old-failed",)?.status,).toBe("expired",);
    expect(byId.get("fresh-complete",)?.status,).toBe("complete",);
    expect(byId.get("fresh-complete",)?.response_body,).toBe("fresh-body",);
    expect(byId.get("old-pending",)?.status,).toBe("pending",);
    daemon.stop();
  });

  test("zero-size TTL expires everything completed in the past", async () => {
    await seedRequest(db, {
      id: "ttl-zero",
      status: "complete",
      completedAt: minutesAgo(0.001,),
      responseBody: null,
    },);
    const daemon = startOffloadDaemon(db, {}, { ttlMs: 0, minAgeMs: 0, },);
    const result = await daemon.runOnce();
    expect(result.expired,).toBeGreaterThanOrEqual(1,);
    daemon.stop();
  });
});

describe("OffloadDaemon.runOnce — phase 3: expired spill cleanup", () => {
  let db: Kysely<DB>;
  let sqlite: { close(): void };
  let filePaths: string[];

  beforeEach(async () => {
    const ctx = await createTestDb();
    db = ctx.db;
    sqlite = ctx.sqlite;
    filePaths = [];
    mkdirSync(OFFLOAD_DIR, { recursive: true, },);
  },);

  afterEach(async () => {
    for (const p of filePaths) { rmSync(p, { force: true, },); }
    await db.destroy();
    sqlite.close();
  },);

  test("unlinks spill files of long-expired rows and nulls their paths", async () => {
    const goneFile = path.join(OFFLOAD_DIR, "cleanup-gone.json.gz",);
    writeFileSync(goneFile, "pretend-gzip",);
    filePaths.push(goneFile,);

    const staysFile = path.join(OFFLOAD_DIR, "cleanup-stays.json.gz",);
    writeFileSync(staysFile, "pretend-gzip",);
    filePaths.push(staysFile,);

    // Long expired (completed_at older than 2× ttl) → file must be removed.
    await seedRequest(db, {
      id: "expired-old",
      status: "expired",
      completedAt: minutesAgo(60,),
      offloadPath: goneFile,
    },);
    // Recently expired (within 2× ttl) → file must stay.
    await seedRequest(db, {
      id: "expired-recent",
      status: "expired",
      completedAt: minutesAgo(0.5,),
      offloadPath: staysFile,
    },);
    // Long expired without a spill path → nothing to clean.
    await seedRequest(db, {
      id: "expired-nopath",
      status: "expired",
      completedAt: minutesAgo(60,),
      offloadPath: null,
    },);

    const daemon = startOffloadDaemon(db, {}, { ttlMs: 60 * 1000, minAgeMs: 0, },);
    await daemon.runOnce();

    expect(existsSync(goneFile,),).toBe(false,);
    expect(existsSync(staysFile,),).toBe(true,);

    const oldRow = await db
      .selectFrom("request_results",)
      .select("offload_path",)
      .where("id", "=", "expired-old",)
      .executeTakeFirst();
    expect(oldRow?.offload_path,).toBeNull();
    const recentRow = await db
      .selectFrom("request_results",)
      .select("offload_path",)
      .where("id", "=", "expired-recent",)
      .executeTakeFirst();
    expect(recentRow?.offload_path,).toBe(staysFile,);
    daemon.stop();
  });

  test("tolerates an already-vanished spill file (still nulls the path)", async () => {
    const missingFile = path.join(OFFLOAD_DIR, "cleanup-missing.json.gz",);
    await seedRequest(db, {
      id: "expired-missing-file",
      status: "expired",
      completedAt: minutesAgo(60,),
      offloadPath: missingFile,
    },);

    const daemon = startOffloadDaemon(db, {}, { ttlMs: 60 * 1000, minAgeMs: 0, },);
    await daemon.runOnce();

    const row = await db
      .selectFrom("request_results",)
      .select("offload_path",)
      .where("id", "=", "expired-missing-file",)
      .executeTakeFirst();
    expect(row?.offload_path,).toBeNull();
    daemon.stop();
  });
});

describe("OffloadDaemon lifecycle", () => {
  let db: Kysely<DB>;
  let sqlite: { close(): void };

  beforeEach(async () => {
    const ctx = await createTestDb();
    db = ctx.db;
    sqlite = ctx.sqlite;
  },);

  afterEach(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("start() ticks the daemon until a ripe row is offloaded; stop() halts and is idempotent", async () => {
    await seedRequest(db, {
      id: "daemon-tick-1",
      status: "complete",
      completedAt: minutesAgo(10,),
      responseBody: "w".repeat(32,),
    },);

    mkdirSync(OFFLOAD_DIR, { recursive: true, },);
    const daemon: OffloadDaemon = startOffloadDaemon(db, {}, {
      intervalMs: 25,
      minAgeMs: 0,
      maxInlineBytes: 10,
    },);
    try {
      // Double start must not throw or spawn a second timer.
      daemon.start();
      daemon.start();
      // Real-timer poll (justified: the daemon ticks on a genuine setInterval
      // with no fake-timer seam; the awaited condition is the spill file).
      await waitFor(() => offloadExists("daemon-tick-1",), { timeoutMs: 3000, stepMs: 25, },);
      expect(daemon.state.lastWriteAt,).toBeGreaterThan(0,);
    } finally {
      daemon.stop();
      daemon.stop(); // idempotent
    }

    const row = await db
      .selectFrom("request_results",)
      .select(["response_body", "offload_path",],)
      .where("id", "=", "daemon-tick-1",)
      .executeTakeFirst();
    expect(row?.response_body,).toBeNull();
    expect(row?.offload_path,).toBeTypeOf("string",);
    if (row?.offload_path) { rmSync(row.offload_path, { force: true, },); }
  });

  test("runOnce on an empty store reports zero work", async () => {
    const daemon = startOffloadDaemon(db, {}, { minAgeMs: 0, ttlMs: 0, },);
    const result = await daemon.runOnce();
    expect(result.offloaded,).toBe(0,);
    expect(result.expired,).toBe(0,);
    expect(daemon.state.rowCount,).toBe(0,);
    daemon.stop();
  });
});

describe("OffloadDaemon.runOnce — reentrancy", () => {
  test("a second overlapping runOnce is a no-op while the first is in flight", async () => {
    const ctx = await createTestDb();
    try {
      const daemon = startOffloadDaemon(ctx.db, {}, { minAgeMs: 0, maxInlineBytes: 10, },);
      // The first call sets its `running` flag synchronously (before the first
      // await), so the immediately-invoked second call must observe it and
      // bail out with zero work instead of double-processing.
      const inFlight = daemon.runOnce();
      const overlapping = await daemon.runOnce();
      expect(overlapping,).toEqual({ offloaded: 0, expired: 0, },);
      expect(await inFlight,).toEqual({ offloaded: 0, expired: 0, },);
      daemon.stop();
    } finally {
      await ctx.db.destroy();
      ctx.sqlite.close();
    }
  });
});
