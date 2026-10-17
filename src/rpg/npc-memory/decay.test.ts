// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/npc-memory/decay.test.ts — the decay multiplier table, the
 * reinforcement clock, and the sweep's expired/forgotten bookkeeping.
 *
 * `decayLoss` is pure, so the multiplier ordering is asserted directly; the
 * DB-backed cases prove the sweep honours the same numbers.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { type DecayInputs, decayLoss, decayMemories, recordMemory, reinforceMemory, } from "./index";

const DAY_MS = 86_400_000;

let db: Kysely<DB>;
let clockMs: number;

beforeEach(async () => {
  ({ db, } = await createTestDb());
  await insertUsers(db, "owner", "Owner", { id: "user-owner", },);
  await insertWorlds(db, "user-owner", "Test World", { id: "w1", },);
  await insertActors(db, "Innkeeper", { id: "npc-1", },);
  clockMs = Date.UTC(2026, 0, 1, 0, 0, 0, 0,);
},);

afterEach(async () => {
  await db.destroy();
},);

function now(): Date {
  return new Date(clockMs,);
}

function inputs(overrides: Partial<DecayInputs> = {},): DecayInputs {
  return { importance: 50, emotionalImpact: 0, shared: 0, decayRate: 1, elapsedDays: 1, ...overrides, };
}

type MemoryOverrides = Partial<Parameters<typeof recordMemory>[0]["memory"]>;

async function addMemory(overrides: MemoryOverrides = {},) {
  return recordMemory({
    db,
    worldId: "w1",
    npcId: "npc-1",
    memory: { content: "a memory", ...overrides, },
    now: now(),
  },);
}

async function importanceOf(id: string,): Promise<number> {
  const row = await db.selectFrom("npc_memories",).select("importance",).where("id", "=", id,).executeTakeFirst();
  return row?.importance ?? -1;
}

describe("decayLoss", () => {
  test("high importance loses less than low importance over identical time", () => {
    const high = decayLoss(inputs({ importance: 90, },),);
    const low = decayLoss(inputs({ importance: 10, },),);
    expect(high,).toBeLessThan(low,);
    // The multiplier runs 1.00 at importance 0 down to IMPORTANCE_FLOOR (0.10)
    // at importance 100, so 90 -> x0.19 and 10 -> x0.91.
    expect(high,).toBeCloseTo(0.19, 5,);
    expect(low,).toBeCloseTo(0.91, 5,);
    expect(decayLoss(inputs({ importance: 100, },),),).toBeCloseTo(0.1, 5,);
  });

  test("emotional magnitude and sharing both slow decay", () => {
    const plain = decayLoss(inputs(),);
    const emotional = decayLoss(inputs({ emotionalImpact: -100, },),);
    const shared = decayLoss(inputs({ shared: 1, },),);
    expect(emotional,).toBeLessThan(plain,);
    expect(shared,).toBeLessThan(plain,);
    // Sign does not matter - only magnitude anchors a memory.
    expect(decayLoss(inputs({ emotionalImpact: 100, },),),).toBeCloseTo(emotional, 10,);
  });

  test("loss scales linearly with elapsed days and never goes negative", () => {
    expect(decayLoss(inputs({ elapsedDays: 4, },),),).toBeCloseTo(decayLoss(inputs(),) * 4, 10,);
    expect(decayLoss(inputs({ decayRate: -5, },),),).toBeLessThan(0,);
  });
});

describe("decayMemories", () => {
  test("high-importance memory decays slower than low-importance over the same span", async () => {
    const high = await addMemory({ content: "salient", importance: 90, },);
    const low = await addMemory({ content: "trivial", importance: 10, },);

    clockMs += 3 * DAY_MS;
    const result = await decayMemories(db, now(),);

    expect(result.swept,).toBe(2,);
    const highAfter = await importanceOf(high.id,);
    const lowAfter = await importanceOf(low.id,);
    expect(highAfter,).toBeGreaterThan(lowAfter,);
  });

  test("a shared memory outlives a private one with identical importance", async () => {
    const retold = await addMemory({ content: "retold", importance: 40, shared: true, },);
    const kept = await addMemory({ content: "kept", importance: 40, shared: false, },);

    clockMs += 2 * DAY_MS;
    await decayMemories(db, now(),);

    expect(await importanceOf(retold.id,),).toBeGreaterThan(await importanceOf(kept.id,),);
  });

  test("reinforcement resets the decay clock", async () => {
    const reinforced = await addMemory({ content: "rehearsed", importance: 50, },);
    const untouched = await addMemory({ content: "forgotten", importance: 50, },);

    clockMs += 2 * DAY_MS;
    await reinforceMemory(db, reinforced.id, now(),);

    clockMs += 2 * DAY_MS;
    await decayMemories(db, now(),);

    // The reinforced memory restarted its clock at +2d, so it has only the
    // 0.01-day floor of decay on top of the +1 reinforcement bump.
    expect(await importanceOf(reinforced.id,),).toBeGreaterThan(50.9,);
    expect(await importanceOf(untouched.id,),).toBeLessThan(50,);
  });

  test("the sweep purges expired memories", async () => {
    await addMemory({ content: "expired", importance: 90, expiresAt: "2026-01-02T00:00:00.000Z", },);
    await addMemory({ content: "kept", importance: 90, expiresAt: "2099-01-01T00:00:00.000Z", },);

    clockMs += 2 * DAY_MS;
    const result = await decayMemories(db, now(),);

    expect(result.expired,).toBe(1,);
    expect(result.swept,).toBe(1,);
    const rows = await db.selectFrom("npc_memories",).select("content",).execute();
    expect(rows.map((row,) => row.content),).toEqual(["kept",],);
  });

  test("a memory that fades to zero is forgotten", async () => {
    const fragile = await addMemory({ content: "ephemeral", importance: 2, decayRate: 5, },);
    await addMemory({ content: "stubborn", importance: 90, decayRate: 5, },);

    clockMs += DAY_MS;
    const result = await decayMemories(db, now(),);

    expect(result.forgotten,).toBe(1,);
    expect(await importanceOf(fragile.id,),).toBe(-1,);
  });

  test("is idempotent when re-run at the same instant", async () => {
    await addMemory({ content: "stable", importance: 50, },);
    await decayMemories(db, now(),);
    const first = await importanceOf(
      (await db.selectFrom("npc_memories",).select("id",).executeTakeFirstOrThrow()).id,
    );

    await decayMemories(db, now(),);
    const second = await importanceOf(
      (await db.selectFrom("npc_memories",).select("id",).executeTakeFirstOrThrow()).id,
    );

    // The clock has not moved, so the second sweep charges only the
    // 0.01-day floor rather than a full day of loss.
    expect(second,).toBeLessThan(first,);
    expect(first - second,).toBeLessThan(0.001,);
  });
});
