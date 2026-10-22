// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * FEAT-xp-sources — the quest / discovery XP legs.
 *
 * Each leg goes through the LevelService pipeline (ledger source +
 * reference id, idempotent), is best-effort, and pays the actor that owns
 * the completed activity.
 */
import { beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema.js";
import { createLogger, } from "../../logger/index.js";
import { applyDiscoveryXpLeg, } from "../../rpg/world-discovery/xp-leg";
import { createTestDb, } from "../../test-utils/create-test-db.js";
import { insertActors, insertQuests, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers.js";
import { awardQuestCompletionXp, } from "./xp";

let db: Kysely<DB>;
let ownerId: string;

beforeAll(async () => {
  db = (await createTestDb()).db;
  createLogger({ level: "error", },);
  ownerId = await insertUsers(db, "sources-owner", "Sources Owner",);
},);

async function ledgerFor(actorId: string,) {
  return db.selectFrom("xp_ledger",).selectAll().where("actor_id", "=", actorId,).execute();
}

async function seedActor(name: string,): Promise<string> {
  return insertActors(db, name, { user_id: ownerId, actor_type: "character", },);
}

describe("awardQuestCompletionXp", () => {
  test("pays the creator through the quest pipeline, idempotent per quest", async () => {
    const creator = await seedActor("Quest Creator",);
    const worldId = await insertWorlds(db, ownerId, "Quest World", {
      rpg_enabled: 1,
      rpg_dice: 1,
      rpg_checks: 1,
      rpg_combat: 1,
      rpg_xp: 1,
      rpg_loot: 1,
      rpg_quests: 1,
    },);

    const questId = await insertQuests(db, worldId, creator, "Slay the beast", "social", 1, { category: "main", },);

    const quest = await db.selectFrom("quests",).selectAll().where("id", "=", questId,).executeTakeFirstOrThrow();
    await awardQuestCompletionXp(db, quest,);
    await awardQuestCompletionXp(db, quest,);

    const rows = await ledgerFor(creator,);
    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.source,).toBe("quest",);
    expect(rows[0]!.reference_id,).toBe(questId,);
    expect(rows[0]!.amount,).toBeGreaterThan(0,);
  });

  test("a quest without a creator grants nothing", async () => {
    await awardQuestCompletionXp(db, { id: "q-x", name: "Orphan", creator_id: "", },);
    const orphan = await db.selectFrom("xp_ledger",).selectAll().where("reference_id", "=", "q-x",).execute();
    expect(orphan,).toHaveLength(0,);
  });
});

describe("applyDiscoveryXpLeg", () => {
  test("pays the flat discovery award keyed to world:location", async () => {
    const explorer = await seedActor("Explorer",);
    const worldId = await insertWorlds(db, ownerId, "Discovery World", {
      rpg_enabled: 1,
      rpg_dice: 1,
      rpg_checks: 1,
      rpg_combat: 1,
      rpg_xp: 1,
      rpg_loot: 1,
      rpg_quests: 1,
    },);

    const location = `loc-${crypto.randomUUID()}`;
    await applyDiscoveryXpLeg(db, explorer, worldId, location,);
    await applyDiscoveryXpLeg(db, explorer, worldId, location,);

    const rows = await ledgerFor(explorer,);
    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.source,).toBe("discovery",);
    expect(rows[0]!.reference_id,).toBe(JSON.stringify([worldId, location,],),);
    expect(rows[0]!.amount,).toBe(50,);
  });
});
