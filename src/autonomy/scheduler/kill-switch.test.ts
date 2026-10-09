// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors:

/**
 * Scheduler kill-switch gate tests.
 *
 * Covers:
 *   - flag on → every world tick skips dispatch (`kill_switch`) and no
 *     governor consume happens (no budget row, no LLM spend)
 *   - flag off → ticks dispatch exactly as today (budgets enforced, row written)
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertChats,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { toDate, } from "../../utils/date";
import { KILL_SWITCH_ENV_VAR, } from "../governor/kill-switch";
import { AutonomyScheduler, } from "./index";

let db: Kysely<DB>;

/** RNG that never loses the jitter coin flip (1.0 > any ratio). */
const RNG_FIRES = (): number => 1;

/** Fixed instant so cursor arithmetic is exact. */
const T0 = 1_800_000_000_000;

beforeEach(async () => {
  ({ db, } = await createTestDb());
},);

afterEach(async () => {
  delete process.env[KILL_SWITCH_ENV_VAR];
  await db.destroy();
},);

async function makeWorld(name: string,) {
  const ownerId = uid();
  const worldId = uid();
  await insertUsers(db, "owner-" + ownerId, "Owner " + name, { id: ownerId, },);
  await insertWorlds(db, ownerId, name, { id: worldId, },);
  const chatId = uid();
  await insertChats(db, "chat-" + chatId, ownerId, { id: chatId, world_id: worldId, },);
  return { worldId, chatId, };
}

/** Force a world's cursor into the due set. */
async function setDue(worldId: string, nextTickAtMs: number,): Promise<void> {
  const row = {
    next_tick_at: toDate(nextTickAtMs,).toISOString(),
    paused: 0,
  };

  await db
    .insertInto("world_simulation_state",)
    .values({ world_id: worldId, ...row, last_run_at: null, last_error: null, tick_count: 0, },)
    .onConflict((oc,) => oc.column("world_id",).doUpdateSet(row,))
    .execute();
}

describe("AutonomyScheduler kill switch", () => {
  test("flag on → every dispatch skipped, nothing consumed", async () => {
    process.env[KILL_SWITCH_ENV_VAR] = "1";
    const { worldId, } = await makeWorld("killed",);
    await setDue(worldId, T0 - 10_000,);
    const sched = new AutonomyScheduler(db, { rng: RNG_FIRES, },);

    const result = await sched.tickOnce(T0,);

    expect(result.dueWorldIds,).toEqual([worldId,],);
    expect(result.worlds,).toHaveLength(1,);
    expect(result.worlds[0]!.outcome,).toEqual({ skipped: "kill_switch", },);

    const rows = await db.selectFrom("autonomy_budget",).selectAll().execute();
    expect(rows.length,).toBe(0,);
  });

  test("flag off → ticks dispatch and budgets enforced as today", async () => {
    const { worldId, } = await makeWorld("live",);
    await setDue(worldId, T0 - 10_000,);
    const sched = new AutonomyScheduler(db, { rng: RNG_FIRES, },);

    const result = await sched.tickOnce(T0,);

    expect(result.worlds[0]!.outcome,).toEqual({ dispatched: 0, },);

    const rows = await db.selectFrom("autonomy_budget",).selectAll().execute();
    expect(rows.length,).toBe(1,);
  });
});
