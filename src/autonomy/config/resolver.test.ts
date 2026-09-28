// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * resolveAutonomyConfig unit tests.
 *
 * Covers:
 *   - Layering precedence (actor > chat > world > preset default)
 *   - dev-only gating of `unlimited-stress` preset
 *   - field-level merging: only keys present in the override are applied
 *   - resilience: invalid JSON in any column falls through cleanly
 *
 * Uses createTestDb (full migration chain incl. 021) and raw UPDATE
 * for autonomy_config columns that are not yet exposed in the
 * generated insert-helpers (sync runs at orchestrator phase end).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { sql, } from "kysely";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertCharacterInternalTraits,
  insertChats,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { resolveAutonomyConfig, UnboundedStressGatedError, } from "./index";
import { getPreset, PRESETS, } from "./presets";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
},);

afterAll(async () => {
  await testDb.db.destroy();
},);

async function setColumn(
  table: "chats" | "worlds",
  id: string,
  json: string,
): Promise<void> {
  await sql`UPDATE ${sql.table(table,)} SET autonomy_config = ${json} WHERE id = ${id}`.execute(testDb.db,);
}

/**
 * Insert a fresh user/world/chat/actor + traits row (no actor
 * autonomy override by default — pass `actorAutonomy` to set one).
 * @param actorAutonomy optional JSON for character_internal_traits.autonomy_preferences
 */
async function setupScope(
  actorAutonomy?: string,
): Promise<{ worldId: string; chatId: string; actorId: string }> {
  const userId = await insertUsers(
    testDb.db,
    `autonomy-u-${crypto.randomUUID()}`,
    "Autonomy Owner",
  );
  const worldId = await insertWorlds(testDb.db, userId, "Autonomy World",);
  const chatId = await insertChats(
    testDb.db,
    "Autonomy Chat",
    userId,
    { world_id: worldId, },
  );
  const actorId = await insertActors(testDb.db, "Autonomy Actor",);
  await insertCharacterInternalTraits(testDb.db, actorId, {
    autonomy_preferences: actorAutonomy,
  },);
  return { worldId, chatId, actorId, };
}

describe("resolveAutonomyConfig — layering precedence", () => {
  test("no overrides → organic preset, enabled, defaults filled from preset", async () => {
    const { worldId, chatId, } = await setupScope();
    const cfg = await resolveAutonomyConfig(testDb.db, { worldId, chatId, },);
    expect(cfg.preset,).toBe("organic",);
    expect(cfg.enabled,).toBe(true,);
    expect(cfg.tickIntervalMs,).toBe(PRESETS.organic.tickIntervalMs,);
    expect(cfg.jitterRatio,).toBe(PRESETS.organic.jitterRatio,);
    expect(cfg.perAgentCap,).toBe(PRESETS.organic.perAgentCap,);
    expect(cfg.perUserCap,).toBe(PRESETS.organic.perUserCap,);
  });

  test("world override sets preset; chat/actor absent", async () => {
    const { worldId, chatId, } = await setupScope();
    await setColumn("worlds", worldId, JSON.stringify({ preset: "brisk", },),);
    const cfg = await resolveAutonomyConfig(testDb.db, { worldId, chatId, },);
    expect(cfg.preset,).toBe("brisk",);
    expect(cfg.tickIntervalMs,).toBe(PRESETS.brisk.tickIntervalMs,);
    expect(cfg.perAgentCap,).toBe(PRESETS.brisk.perAgentCap,);
  });

  test("chat preset wins over world; world-set scalar survives", async () => {
    const { worldId, chatId, } = await setupScope();
    await setColumn("worlds", worldId, JSON.stringify({ preset: "brisk", jitterRatio: 0.1, },),);
    await setColumn("chats", chatId, JSON.stringify({ preset: "serene", },),);
    const cfg = await resolveAutonomyConfig(testDb.db, { worldId, chatId, },);
    expect(cfg.preset,).toBe("serene",);
    expect(cfg.tickIntervalMs,).toBe(PRESETS.serene.tickIntervalMs,);
    // World explicitly set jitterRatio; chat didn't touch it → world wins.
    expect(cfg.jitterRatio,).toBe(0.1,);
  });

  test("actor override wins over chat and world", async () => {
    const { worldId, chatId, actorId, } = await setupScope(
      JSON.stringify({
        autonomy: { preset: "organic", tickIntervalMs: 12_345, },
      },),
    );
    await setColumn("worlds", worldId, JSON.stringify({ preset: "brisk", },),);
    await setColumn("chats", chatId, JSON.stringify({ preset: "serene", perUserCap: 999, },),);
    const cfg = await resolveAutonomyConfig(testDb.db, { worldId, chatId, actorId, },);
    expect(cfg.preset,).toBe("organic",);
    expect(cfg.tickIntervalMs,).toBe(12_345,);
    // chat perUserCap preserved through actor layer (actor didn't override it).
    expect(cfg.perUserCap,).toBe(999,);
  });

  test("actor override tolerates legacy autonomy_preferences without `autonomy` key", async () => {
    const { worldId, chatId, actorId, } = await setupScope(
      JSON.stringify({
        group_comfort: 80,
        solo_comfort: 20,
      },),
    );
    const cfg = await resolveAutonomyConfig(testDb.db, { worldId, chatId, actorId, },);
    expect(cfg.preset,).toBe("organic",);
    expect(cfg.tickIntervalMs,).toBe(PRESETS.organic.tickIntervalMs,);
  });

  test("invalid JSON in any layer falls through to next layer", async () => {
    const { worldId, chatId, } = await setupScope();
    await setColumn("worlds", worldId, "{not-json",);
    await setColumn("chats", chatId, JSON.stringify({ preset: "brisk", },),);
    const cfg = await resolveAutonomyConfig(testDb.db, { worldId, chatId, },);
    expect(cfg.preset,).toBe("brisk",);
  });

  test("chat enabled=true wins over world enabled=false (highest layer wins)", async () => {
    const { worldId, chatId, } = await setupScope();
    await setColumn("worlds", worldId, JSON.stringify({ enabled: false, },),);
    await setColumn("chats", chatId, JSON.stringify({ enabled: true, },),);
    const cfg = await resolveAutonomyConfig(testDb.db, { worldId, chatId, },);
    expect(cfg.enabled,).toBe(true,);
  });
});

describe("dev-only gating", () => {
  test("unlimited-stress preset returns definition outside production", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      const def = getPreset("unlimited-stress",);
      expect(def.perAgentCap,).toBeNull();
      expect(def.tickIntervalMs,).toBe(1_000,);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  test("unlimited-stress preset throws in production", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(() => getPreset("unlimited-stress",)).toThrow(UnboundedStressGatedError,);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  test("unlimited-stress can be selected at the resolver in dev", async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      const { worldId, chatId, } = await setupScope();
      await setColumn(
        "worlds",
        worldId,
        JSON.stringify({ preset: "unlimited-stress", },),
      );
      const cfg = await resolveAutonomyConfig(testDb.db, { worldId, chatId, },);
      expect(cfg.preset,).toBe("unlimited-stress",);
      expect(cfg.perAgentCap,).toBeNull();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  test("unlimited-stress at world layer throws in production via resolver", async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const { worldId, chatId, } = await setupScope();
      await setColumn(
        "worlds",
        worldId,
        JSON.stringify({ preset: "unlimited-stress", },),
      );
      await expect(
        resolveAutonomyConfig(testDb.db, { worldId, chatId, },),
      ).rejects.toBeInstanceOf(UnboundedStressGatedError,);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
