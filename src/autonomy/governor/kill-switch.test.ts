// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors:

/**
 * Global kill-switch tests for `AutonomyGovernor.tryConsume`.
 *
 * Covers:
 *   - flag off (the default) → denial is the default once the cap is spent
 *   - flag on → deny with budget remaining, no row written, no counter advanced
 *   - flag on → deny even for unbounded (`unlimited-stress`) scopes, so the
 *     kill switch wins over the dev/stress flag
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { createTestDb, resetTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertCharacterInternalTraits,
  insertChats,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { AutonomyGovernor, } from "./index";
import { KILL_SWITCH_ENV_VAR, } from "./kill-switch";

let testDb: TestDb;
beforeAll(async () => {
  testDb = await createTestDb();
},);

afterAll(async () => {
  await testDb.db.destroy();
},);

let savedKill: string | undefined;
beforeEach(() => {
  savedKill = process.env[KILL_SWITCH_ENV_VAR];
  resetTestDb(testDb.sqlite,);
},);

afterEach(() => {
  if (savedKill === undefined) { delete process.env[KILL_SWITCH_ENV_VAR]; }
  else { process.env[KILL_SWITCH_ENV_VAR] = savedKill; }
},);

async function setupScope(): Promise<{ chatId: string; actorId: string }> {
  const userId = await insertUsers(testDb.db, `kill-u-${crypto.randomUUID()}`, "K User",);
  const worldId = await insertWorlds(testDb.db, userId, "K World",);
  const chatId = await insertChats(testDb.db, "K Chat", userId, { world_id: worldId, },);
  const actorId = await insertActors(testDb.db, "K Actor",);
  await insertCharacterInternalTraits(testDb.db, actorId, {},);
  return { chatId, actorId, };
}

describe("AutonomyGovernor kill switch", () => {
  test("flag off → denial is the default once the cap is spent", async () => {
    delete process.env[KILL_SWITCH_ENV_VAR];
    const { chatId, actorId, } = await setupScope();
    const gov = new AutonomyGovernor();
    const scope = { kind: "actor" as const, id: actorId, };

    const first = await gov.tryConsume(testDb.db, scope, "per_minute_generation", {
      cap: 1,
      chatId,
    },);

    expect(first.ok,).toBe(true,);

    const denied = await gov.tryConsume(testDb.db, scope, "per_minute_generation", {
      cap: 1,
      chatId,
    },);

    expect(denied.ok,).toBe(false,);
    expect(denied.remaining,).toBe(0,);
  });

  test("flag on → denies with budget remaining, writes no row", async () => {
    const { chatId, actorId, } = await setupScope();
    process.env[KILL_SWITCH_ENV_VAR] = "1";
    const gov = new AutonomyGovernor();

    const denied = await gov.tryConsume(
      testDb.db,
      { kind: "actor", id: actorId, },
      "per_minute_generation",
      { cap: 5, chatId, },
    );

    expect(denied.ok,).toBe(false,);
    expect(denied.remaining,).toBe(0,);

    const rows = await testDb.db.selectFrom("autonomy_budget",).selectAll().execute();
    expect(rows.length,).toBe(0,);
  });

  test("flag on → denies even unbounded unlimited-stress scopes", async () => {
    const { chatId, actorId, } = await setupScope();
    process.env[KILL_SWITCH_ENV_VAR] = "true";
    const gov = new AutonomyGovernor();

    const denied = await gov.tryConsume(
      testDb.db,
      { kind: "actor", id: actorId, },
      "per_minute_generation",
      { cap: null, chatId, },
    );

    expect(denied.ok,).toBe(false,);

    const rows = await testDb.db.selectFrom("autonomy_budget",).selectAll().execute();
    expect(rows.length,).toBe(0,);
  });
});
