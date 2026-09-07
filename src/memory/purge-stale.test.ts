// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage for `purgeStaleMemories` (purge.ts) — both soft (confidence
 * demotion) and hard (delete) paths, the never-accessed (`last_accessed_at
 * IS NULL`) branch, boundary configs (zero staleAfterChats), and empty stores.
 */

import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, } from "../test-utils/insert-helpers";
import { purgeStaleMemories, } from "./purge";

/** Seed one actor_memories row with purge-relevant fields. */
async function seedMemory(
  db: Kysely<DB>,
  opts: {
    id: string;
    actorId?: string;
    confidence?: number;
    strength?: number;
    lastAccessedAt?: string | null;
  },
): Promise<void> {
  await db
    .insertInto("actor_memories",)
    .values({
      id: opts.id,
      actor_id: opts.actorId ?? "actor-purge",
      content: `memory ${opts.id}`,
      memory_type: "episodic",
      confidence: opts.confidence ?? 1,
      importance: 1,
      keywords: "[]",
      strength: opts.strength ?? 1,
      decay_rate: 0,
      last_accessed_at: opts.lastAccessedAt ?? null,
      scope: "character",
      privacy: "shared",
      pinned: "unpinned",
    },)
    .execute();
}

/** Days-ago ISO timestamp helper. */
function daysAgo(days: number,): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000,).toISOString();
}

/** Fetch a single column value for one row. */
async function field(
  db: Kysely<DB>,
  id: string,
  column: "confidence" | "strength",
): Promise<number | null> {
  const row = await db
    .selectFrom("actor_memories",)
    .select(column,)
    .where("id", "=", id,)
    .executeTakeFirst();
  return row ? (row[column] as number) : null;
}

describe("purgeStaleMemories — soft purge", () => {
  let db: Kysely<DB>;
  let sqlite: { close(): void };

  beforeEach(async () => {
    createLogger({ level: "error", },);
    const ctx = await createTestDb();
    db = ctx.db;
    sqlite = ctx.sqlite;
    await insertActors(db, "Purge Actor", { id: "actor-purge", } as never,);
  },);

  afterEach(() => {
    sqlite.close();
  },);

  it("demotes confidence of stale weak memories without deleting them", async () => {
    await seedMemory(db, { id: "stale-1", confidence: 0.5, strength: 0.05, lastAccessedAt: daysAgo(30,), },);

    const result = await purgeStaleMemories(db, { staleAfterChats: 10, },);

    expect(result,).toEqual({ stale: 1, deleted: 0, },);
    expect(await field(db, "stale-1", "confidence",),).toBe(0.01,);
    const count = await db.selectFrom("actor_memories",).select("id",).execute();
    expect(count,).toHaveLength(1,);
  });

  it("matches never-accessed memories via the IS NULL branch", async () => {
    await seedMemory(db, { id: "never-1", confidence: 0.5, strength: 0.05, lastAccessedAt: null, },);
    const result = await purgeStaleMemories(db, { staleAfterChats: 10, },);
    expect(result.stale,).toBe(1,);
  });

  it("leaves recently-accessed memories alone", async () => {
    await seedMemory(db, { id: "fresh-1", confidence: 0.5, strength: 0.05, lastAccessedAt: daysAgo(1,), },);
    const result = await purgeStaleMemories(db, { staleAfterChats: 10, },);
    expect(result,).toEqual({ stale: 0, deleted: 0, },);
    expect(await field(db, "fresh-1", "confidence",),).toBe(0.5,);
  });

  it("skips memories whose confidence is already at or below the floor", async () => {
    // Soft purge requires confidence > minConfidence (0.2); a demoted memory
    // must not be re-processed.
    await seedMemory(db, { id: "already-demoted", confidence: 0.2, strength: 0.05, lastAccessedAt: daysAgo(30,), },);
    await seedMemory(db, { id: "below-floor", confidence: 0.05, strength: 0.05, lastAccessedAt: daysAgo(30,), },);
    const result = await purgeStaleMemories(db, { staleAfterChats: 10, },);
    expect(result.stale,).toBe(0,);
  });

  it("skips memories whose strength is above the survival threshold", async () => {
    await seedMemory(db, { id: "strong-1", confidence: 0.5, strength: 0.5, lastAccessedAt: daysAgo(30,), },);
    const result = await purgeStaleMemories(db, { staleAfterChats: 10, },);
    expect(result.stale,).toBe(0,);
    expect(await field(db, "strong-1", "strength",),).toBe(0.5,);
  });

  it("zero staleAfterChats treats every accessed memory as stale", async () => {
    await seedMemory(db, { id: "z-1", confidence: 0.5, strength: 0.05, lastAccessedAt: daysAgo(0.001,), },);
    const result = await purgeStaleMemories(db, { staleAfterChats: 0, },);
    expect(result.stale,).toBeGreaterThanOrEqual(1,);
  });

  it("returns zero counts on an empty memory table", async () => {
    const result = await purgeStaleMemories(db, {},);
    expect(result,).toEqual({ stale: 0, deleted: 0, },);
  });
});

describe("purgeStaleMemories — hard delete", () => {
  let db: Kysely<DB>;
  let sqlite: { close(): void };

  beforeEach(async () => {
    createLogger({ level: "error", },);
    const ctx = await createTestDb();
    db = ctx.db;
    sqlite = ctx.sqlite;
    await insertActors(db, "Purge Actor", { id: "actor-purge", } as never,);
  },);

  afterEach(() => {
    sqlite.close();
  },);

  it("deletes stale low-confidence low-strength memories and reports both counts", async () => {
    await seedMemory(db, { id: "gone-1", confidence: 0.1, strength: 0.05, lastAccessedAt: daysAgo(30,), },);
    await seedMemory(db, { id: "gone-2", confidence: 0.05, strength: 0.0, lastAccessedAt: null, },);
    await seedMemory(db, { id: "kept-1", confidence: 0.9, strength: 0.9, lastAccessedAt: daysAgo(30,), },);

    const result = await purgeStaleMemories(db, { staleAfterChats: 10, hardDelete: true, },);

    expect(result,).toEqual({ stale: 2, deleted: 2, },);
    const remaining = await db.selectFrom("actor_memories",).select("id",).execute();
    expect(remaining.map((r,) => r.id),).toEqual(["kept-1",],);
  });

  it("keeps recently-touched memories even when hard-deleting", async () => {
    await seedMemory(db, { id: "recent-strong", confidence: 0.1, strength: 0.05, lastAccessedAt: daysAgo(1,), },);
    const result = await purgeStaleMemories(db, { staleAfterChats: 10, hardDelete: true, },);
    expect(result.deleted,).toBe(0,);
    expect(await field(db, "recent-strong", "confidence",),).toBe(0.1,);
  });

  it("respects custom minConfidence/minStrength thresholds", async () => {
    // confidence 0.4 < custom 0.5 floor → eligible for deletion.
    await seedMemory(db, { id: "thr-1", confidence: 0.4, strength: 0.05, lastAccessedAt: daysAgo(30,), },);
    const result = await purgeStaleMemories(db, {
      staleAfterChats: 10,
      hardDelete: true,
      minConfidence: 0.5,
      minStrength: 0.1,
    },);
    expect(result.deleted,).toBe(1,);
  });

  it("returns zero deletions on an empty memory table", async () => {
    const result = await purgeStaleMemories(db, { hardDelete: true, },);
    expect(result,).toEqual({ stale: 0, deleted: 0, },);
  });
});
