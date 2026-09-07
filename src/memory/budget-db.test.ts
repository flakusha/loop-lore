// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * DB-backed coverage for `getMemoriesWithinBudget` (budget.ts) plus the
 * public barrel (`src/memory/index.ts`) it is imported from.
 *
 * Covers: confidence filtering, importance ordering under a tight budget,
 * empty actors, zero-size budgets, and damaged rows (out-of-range numbers).
 */

import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { MemoryType, PinnedState, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, } from "../test-utils/insert-helpers";
// Import through the public barrel so the re-export surface stays loaded.
import { getMemoriesWithinBudget, } from "./index";

/** Seed one actor_memories row with explicit numeric fields. */
async function seedMemory(
  db: Kysely<DB>,
  opts: {
    id: string;
    actorId: string;
    content: string;
    confidence: number;
    importance: number;
    memoryType?: MemoryType;
    pinned?: PinnedState;
  },
): Promise<void> {
  await db
    .insertInto("actor_memories",)
    .values({
      id: opts.id,
      actor_id: opts.actorId,
      content: opts.content,
      memory_type: opts.memoryType ?? "episodic",
      confidence: opts.confidence,
      importance: opts.importance,
      keywords: "[]",
      scope: "character",
      privacy: "shared",
      pinned: opts.pinned ?? "unpinned",
    },)
    .execute();
}

describe("getMemoriesWithinBudget", () => {
  let db: Kysely<DB>;
  let sqlite: { close(): void };

  beforeEach(async () => {
    createLogger({ level: "error", },);
    const ctx = await createTestDb();
    db = ctx.db;
    sqlite = ctx.sqlite;
    await insertActors(db, "Budget Actor", { id: "actor-bud", } as never,);
  },);

  afterEach(() => {
    sqlite.close();
  },);

  it("returns memories above the confidence floor, ordered by importance", async () => {
    await seedMemory(db, {
      id: "m-low",
      actorId: "actor-bud",
      content: "weak claim here",
      confidence: 0.1,
      importance: 10,
    },);
    await seedMemory(db, {
      id: "m-hi",
      actorId: "actor-bud",
      content: "vital survival fact",
      confidence: 0.9,
      importance: 5,
    },);

    const result = await getMemoriesWithinBudget(db, "actor-bud", { maxTokens: 1024, },);

    expect(result.map((m,) => m.content),).toEqual(["vital survival fact",],);
  });

  it("drops lowest-importance memories first when the budget is tight", async () => {
    await seedMemory(db, {
      id: "m-1",
      actorId: "actor-bud",
      content: "alpha".repeat(8,),
      confidence: 0.9,
      importance: 9,
    },);
    await seedMemory(db, {
      id: "m-2",
      actorId: "actor-bud",
      content: "beta".repeat(8,),
      confidence: 0.9,
      importance: 7,
    },);
    await seedMemory(db, {
      id: "m-3",
      actorId: "actor-bud",
      content: "gamma".repeat(8,),
      confidence: 0.9,
      importance: 3,
    },);

    // Each 40-char content ≈ 10 tokens; budget admits two of the three.
    const result = await getMemoriesWithinBudget(db, "actor-bud", { maxTokens: 20, },);

    expect(result,).toHaveLength(2,);
    expect(result.map((m,) => m.importance),).toEqual([9, 7,],);
  });

  it("returns an empty list for an actor with no memories", async () => {
    await insertActors(db, "Empty Actor", { id: "actor-empty", } as never,);
    const result = await getMemoriesWithinBudget(db, "actor-empty", {},);
    expect(result,).toEqual([],);
  });

  it("returns an empty list for an unknown actor id", async () => {
    const result = await getMemoriesWithinBudget(db, "actor-who-does-not-exist", {},);
    expect(result,).toEqual([],);
  });

  it("zero-size budget selects nothing", async () => {
    await seedMemory(db, {
      id: "m-z",
      actorId: "actor-bud",
      content: "some content",
      confidence: 0.9,
      importance: 5,
    },);
    const result = await getMemoriesWithinBudget(db, "actor-bud", { maxTokens: 0, },);
    expect(result,).toEqual([],);
  });

  it("respectPins: false still returns rows (pinned state is not read from the DB here)", async () => {
    await seedMemory(db, {
      id: "m-pin",
      actorId: "actor-bud",
      content: "pinned row in db",
      confidence: 0.9,
      importance: 5,
      pinned: "pinned",
    },);
    const result = await getMemoriesWithinBudget(db, "actor-bud", { maxTokens: 1024, respectPins: false, },);
    expect(result,).toHaveLength(1,);
    expect(result[0]?.content,).toBe("pinned row in db",);
  });

  it("survives damaged rows with out-of-range confidence (NaN guard via min filter)", async () => {
    // confidence stored out of the documented [0,1] range: -5 is below any
    // meaningful floor and must be filtered, 5 passes the floor but must not
    // corrupt ordering or budget math.
    await seedMemory(db, {
      id: "m-neg",
      actorId: "actor-bud",
      content: "negative confidence row",
      confidence: -5,
      importance: 9,
    },);
    await seedMemory(db, {
      id: "m-big",
      actorId: "actor-bud",
      content: "overconfident row",
      confidence: 5,
      importance: 2,
    },);

    const result = await getMemoriesWithinBudget(db, "actor-bud", { maxTokens: 1024, },);

    expect(result.map((m,) => m.content),).toEqual(["overconfident row",],);
    expect(result[0]?.confidence,).toBe(5,);
  });

  it("negative importance does not crash ordering", async () => {
    await seedMemory(db, {
      id: "m-negimp",
      actorId: "actor-bud",
      content: "dread importance",
      confidence: 0.9,
      importance: -3,
    },);
    const result = await getMemoriesWithinBudget(db, "actor-bud", { maxTokens: 1024, },);
    expect(result,).toHaveLength(1,);
  });
});
