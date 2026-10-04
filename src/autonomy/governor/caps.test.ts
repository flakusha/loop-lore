// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Cap resolution for a governor scope.
 *
 * Covers the path `tryConsume` takes when the caller supplies NO explicit
 * cap — the one that reads caps out of the layered autonomy config. Two
 * things it guards:
 *   - scope kind picks the right ceiling: actor -> perAgentCap,
 *     user -> perUserCap. Getting this backwards is a silent runaway.
 *   - the WORLD layer participates. The world default is the config
 *     surface's headline knob; resolving only chat+actor made a world's
 *     own `perAgentCap` silently resolve to the preset instead.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { sql, } from "kysely";
import { createTestDb, resetTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertCharacterInternalTraits,
  insertChats,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { capFromConfig, resolveScopeConfig, } from "./caps";
import { AutonomyGovernor, } from "./index";
import type { AutonomyScope, } from "./types";

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

async function setWorldConfig(worldId: string, json: string,): Promise<void> {
  await sql`UPDATE worlds SET autonomy_config = ${json} WHERE id = ${worldId}`.execute(
    testDb.db,
  );
}

async function setChatConfig(chatId: string, json: string,): Promise<void> {
  await sql`UPDATE chats SET autonomy_config = ${json} WHERE id = ${chatId}`.execute(
    testDb.db,
  );
}

async function setupScope(): Promise<{
  worldId: string;
  chatId: string;
  actorId: string;
  userId: string;
}> {
  const userId = await insertUsers(testDb.db, `caps-u-${crypto.randomUUID()}`, "Caps User",);
  const worldId = await insertWorlds(testDb.db, userId, "Caps World",);
  const chatId = await insertChats(testDb.db, "Caps Chat", userId, { world_id: worldId, },);
  const actorId = await insertActors(testDb.db, "Caps Actor",);
  await insertCharacterInternalTraits(testDb.db, actorId, {},);
  return { worldId, chatId, actorId, userId, };
}

describe("capFromConfig", () => {
  const cfg = { perAgentCap: 7, perUserCap: 3, } as never;

  test("actor scope reads perAgentCap", () => {
    expect(capFromConfig({ kind: "actor", id: "a1", }, cfg,),).toBe(7,);
  });

  test("user scope reads perUserCap, not perAgentCap", () => {
    expect(capFromConfig({ kind: "user", id: "u1", }, cfg,),).toBe(3,);
  });

  test("null cap passes through as unbounded", () => {
    expect(capFromConfig({ kind: "user", id: "u1", }, { perUserCap: null, } as never,),).toBeNull();
  });
});

describe("resolveScopeConfig", () => {
  test("world layer applies when only a chat id is supplied", async () => {
    const { worldId, chatId, actorId, } = await setupScope();
    // Distinct values so a swapped layer is visible, not coincidental.
    await setWorldConfig(worldId, JSON.stringify({ perAgentCap: 11, perUserCap: 12, },),);
    await setChatConfig(chatId, JSON.stringify({ perAgentCap: 21, },),);

    const actorScope: AutonomyScope = { kind: "actor", id: actorId, };
    const cfg = await resolveScopeConfig(testDb.db, { scope: actorScope, opts: { chatId, }, },);

    // chat overrides world for the actor cap...
    expect(cfg.perAgentCap,).toBe(21,);
    // ...and the world's value survives where the chat is silent.
    expect(cfg.perUserCap,).toBe(12,);
  });

  test("explicit worldId is used when there is no chat row", async () => {
    const { worldId, actorId, } = await setupScope();
    await setWorldConfig(worldId, JSON.stringify({ perAgentCap: 44, },),);

    const cfg = await resolveScopeConfig(testDb.db, {
      scope: { kind: "actor", id: actorId, },
      opts: { worldId, },
    },);

    expect(cfg.perAgentCap,).toBe(44,);
  });

  test("no chat and no world falls back to the preset baseline", async () => {
    const { actorId, } = await setupScope();
    const cfg = await resolveScopeConfig(testDb.db, {
      scope: { kind: "actor", id: actorId, },
      opts: {},
    },);

    expect(cfg.preset,).toBe("organic",);
    expect(cfg.perAgentCap,).toBeGreaterThan(0,);
  });
});

describe("tryConsume without an explicit cap", () => {
  test("denies once the world's perUserCap is exhausted", async () => {
    const { worldId, chatId, userId, } = await setupScope();
    await setWorldConfig(worldId, JSON.stringify({ perUserCap: 2, },),);
    const gov = new AutonomyGovernor();
    const scope: AutonomyScope = { kind: "user", id: userId, };

    const first = await gov.tryConsume(testDb.db, scope, "per_minute_generation", { chatId, },);
    const second = await gov.tryConsume(testDb.db, scope, "per_minute_generation", { chatId, },);
    const third = await gov.tryConsume(testDb.db, scope, "per_minute_generation", { chatId, },);

    expect(first.ok,).toBe(true,);
    expect(second.ok,).toBe(true,);
    expect(third.ok,).toBe(false,);
    expect(third.cap,).toBe(2,);
  });

  test("peek reports the config-resolved cap without spending it", async () => {
    const { worldId, chatId, actorId, } = await setupScope();
    await setWorldConfig(worldId, JSON.stringify({ perAgentCap: 1, },),);
    const gov = new AutonomyGovernor();
    const scope: AutonomyScope = { kind: "actor", id: actorId, };

    const before = await gov.peek(testDb.db, scope, "per_minute_generation", { chatId, },);
    expect(before.cap,).toBe(1,);
    expect(before.remaining,).toBe(1,);

    await gov.tryConsume(testDb.db, scope, "per_minute_generation", { chatId, },);
    const after = await gov.peek(testDb.db, scope, "per_minute_generation", { chatId, },);
    expect(after.remaining,).toBe(0,);
  });

  test("a null cap from config is unbounded: every consume is allowed", async () => {
    const { worldId, chatId, userId, } = await setupScope();
    await setWorldConfig(worldId, JSON.stringify({ perUserCap: null, },),);
    const gov = new AutonomyGovernor();
    const scope: AutonomyScope = { kind: "user", id: userId, };

    for (let i = 0; i < 5; i++) {
      const r = await gov.tryConsume(testDb.db, scope, "per_minute_generation", { chatId, },);
      expect(r.ok,).toBe(true,);
      expect(r.cap,).toBeNull();
    }

    // Unbounded consumes never touch the budget table.
    const rows = await testDb.db.selectFrom("autonomy_budget",).selectAll().execute();
    expect(rows.length,).toBe(0,);
  });
});
