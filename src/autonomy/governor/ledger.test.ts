// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors:

/**
 * Per-actor cost ledger tests (`spendForActor`).
 *
 * Covers:
 *   - totals sum in-window consumes across limit rows, isolated per actor
 *   - unknown actors (no rows) read as zero
 *   - expired windows read as zero (spend is over-window, not lifetime)
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { createTestDb, resetTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertCharacterInternalTraits,
  insertChats,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { AutonomyGovernor, LIMIT_CATALOG, } from "./index";
import { spendForActor, } from "./ledger";

let testDb: TestDb;
beforeAll(async () => {
  testDb = await createTestDb();
},);

afterAll(async () => {
  await testDb.db.destroy();
},);

beforeEach(() => {
  resetTestDb(testDb.sqlite,);
},);

const T0 = 1_000_000;

async function setupScope(name: string,): Promise<{ chatId: string; actorId: string }> {
  const userId = await insertUsers(testDb.db, `ledger-u-${name}`, "L User",);
  const worldId = await insertWorlds(testDb.db, userId, `L World ${name}`,);
  const chatId = await insertChats(testDb.db, `L Chat ${name}`, userId, { world_id: worldId, },);
  const actorId = await insertActors(testDb.db, `L Actor ${name}`,);
  await insertCharacterInternalTraits(testDb.db, actorId, {},);
  return { chatId, actorId, };
}

describe("spendForActor", () => {
  test("sums in-window consumes across limits, isolated per actor", async () => {
    const a = await setupScope("a",);
    const b = await setupScope("b",);
    const gov = new AutonomyGovernor();

    for (let i = 0; i < 2; i++) {
      const r = await gov.tryConsume(
        testDb.db,
        { kind: "actor", id: a.actorId, },
        "per_minute_generation",
        { cap: 5, chatId: a.chatId, nowMs: T0 + i, },
      );

      expect(r.ok,).toBe(true,);
    }

    const beat = await gov.tryConsume(
      testDb.db,
      { kind: "actor", id: a.actorId, },
      "per_hour_beat_dispatch",
      { cap: 5, chatId: a.chatId, nowMs: T0 + 10, },
    );

    expect(beat.ok,).toBe(true,);

    const other = await gov.tryConsume(
      testDb.db,
      { kind: "actor", id: b.actorId, },
      "per_minute_generation",
      { cap: 5, chatId: b.chatId, nowMs: T0, },
    );

    expect(other.ok,).toBe(true,);

    const spendA = await spendForActor(testDb.db, { actorId: a.actorId, nowMs: T0 + 20, },);
    expect(spendA.actorId,).toBe(a.actorId,);
    expect(spendA.total,).toBe(3,);
    expect(spendA.counts.per_minute_generation,).toBe(2,);
    expect(spendA.counts.per_hour_beat_dispatch,).toBe(1,);
    expect(spendA.counts.per_tick_action,).toBe(0,);

    const spendB = await spendForActor(testDb.db, { actorId: b.actorId, nowMs: T0 + 20, },);
    expect(spendB.total,).toBe(1,);
  });

  test("unknown actor reads as zero", async () => {
    const spend = await spendForActor(testDb.db, { actorId: "no-such-actor", nowMs: T0, },);
    expect(spend.total,).toBe(0,);
  });

  test("expired windows read as zero", async () => {
    const { chatId, actorId, } = await setupScope("expiry",);
    const gov = new AutonomyGovernor();
    const windowMs = LIMIT_CATALOG.per_minute_generation.windowMs;

    const r = await gov.tryConsume(
      testDb.db,
      { kind: "actor", id: actorId, },
      "per_minute_generation",
      { cap: 5, chatId, nowMs: T0, },
    );

    expect(r.ok,).toBe(true,);
    expect((await spendForActor(testDb.db, { actorId, nowMs: T0 + 1, },)).total,).toBe(1,);
    expect((await spendForActor(testDb.db, { actorId, nowMs: T0 + windowMs + 1, },)).total,).toBe(0,);
  });
});
