// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor-state-snapshot tests (WI-2 adapters).
 *
 * Seeds `character_stats`, `character_skills` and `world_items` directly and
 * verifies the snapshot derivation: restriction vocabulary, incapacitating
 * states, skill/inventory normalization, and pending-consequence passthrough.
 */
import { beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { CharacterState, ItemCategory, ItemVisibility, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertCharacterSkills,
  insertCharacterStats,
  insertItems,
  insertUsers,
  insertWorldItems,
  insertWorlds,
} from "../test-utils/insert-helpers";
import { buildActorStateSnapshot, deriveRestricted, } from "./state-snapshot";

let db: Kysely<DB>;
let actorId: string;
let worldId: string;

/** Seed an owned inventory item and return the world_items id. */
async function seedCarriedItem(name: string,): Promise<void> {
  const itemId = await insertItems(db, worldId, name, ItemCategory.Weapon,);
  await insertWorldItems(db, worldId, itemId, {
    owner_actor_id: actorId,
    visibility: ItemVisibility.Visible,
  },);
}

describe("buildActorStateSnapshot", () => {
  beforeEach(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    actorId = crypto.randomUUID();
    await insertActors(db, "Captive", { id: actorId, agent_type: "ai", } as never,);
    const ownerId = crypto.randomUUID();
    await insertUsers(db, "owner", "Owner", { id: ownerId, } as never,);
    worldId = crypto.randomUUID();
    await insertWorlds(db, ownerId, "Test World", { id: worldId, } as never,);
  },);

  test("missing stats row degrades to unrestricted unknown state", async () => {
    const snapshot = await buildActorStateSnapshot({ db, actorId, worldId: null, },);
    expect(snapshot.characterState,).toBe("unknown",);
    expect(snapshot.restricted,).toBe(false,);
    expect(snapshot.skills,).toEqual([],);
    expect(snapshot.inventory,).toEqual([],);
    expect(snapshot.pendingConsequences,).toEqual([],);
  });

  test("restriction condition vocabulary sets restricted", async () => {
    await insertCharacterStats(db, actorId, 10, 10, 10, {
      character_state: CharacterState.Active,
      conditions: JSON.stringify([{ name: "Restrained (ropes)", source: "bandits", },],),
    },);

    const snapshot = await buildActorStateSnapshot({ db, actorId, worldId: null, },);
    expect(snapshot.conditions,).toEqual(["restrained (ropes)",],);
    expect(snapshot.restricted,).toBe(true,);
  });

  test("incapacitating character state sets restricted", async () => {
    await insertCharacterStats(db, actorId, 0, 10, 10, {
      character_state: CharacterState.Unconscious,
    },);

    const snapshot = await buildActorStateSnapshot({ db, actorId, worldId: null, },);
    expect(snapshot.restricted,).toBe(true,);
  });

  test("active actor with a broken leg condition is not movement-restricted", async () => {
    await insertCharacterStats(db, actorId, 10, 10, 10, {
      character_state: CharacterState.Active,
      conditions: JSON.stringify([{ name: "sprained wrist", },],),
    },);

    const snapshot = await buildActorStateSnapshot({ db, actorId, worldId: null, },);
    expect(snapshot.restricted,).toBe(false,);
  });

  test("skills and inventory normalize to lowercase names", async () => {
    await insertCharacterSkills(db, actorId, "Acrobatics", "dex", { world_id: worldId, },);
    await seedCarriedItem("Healing Potion",);
    const snapshot = await buildActorStateSnapshot({ db, actorId, worldId, },);
    expect(snapshot.skills,).toEqual(["acrobatics",],);
    expect(snapshot.inventory,).toEqual(["healing potion",],);
  });

  test("null world skips the inventory read", async () => {
    await seedCarriedItem("Healing Potion",);
    const snapshot = await buildActorStateSnapshot({ db, actorId, worldId: null, },);
    expect(snapshot.inventory,).toEqual([],);
  });

  test("pending consequences pass through to the snapshot", async () => {
    const snapshot = await buildActorStateSnapshot({
      db,
      actorId,
      worldId: null,
      pendingConsequences: [{
        id: "fc-1",
        blockedAction: "break",
        reason: "the chains held firm",
      },],
    },);

    expect(snapshot.pendingConsequences,).toHaveLength(1,);
    expect(snapshot.pendingConsequences[0]?.blockedAction,).toBe("break",);
  });
});

describe("deriveRestricted", () => {
  test("restriction needles match as substrings", () => {
    expect(deriveRestricted({ characterState: "active", conditions: ["bound at the wrists",], },),).toBe(true,);
    expect(deriveRestricted({ characterState: "active", conditions: ["webbed to the wall",], },),).toBe(true,);
    expect(deriveRestricted({ characterState: "active", conditions: ["drunk",], },),).toBe(false,);
  });

  test("malformed conditions JSON degrades to empty", async () => {
    await insertCharacterStats(db, actorId, 10, 10, 10, {
      character_state: CharacterState.Active,
      conditions: "not-json",
    },);

    const snapshot = await buildActorStateSnapshot({ db, actorId, worldId: null, },);
    expect(snapshot.conditions,).toEqual([],);
    expect(snapshot.restricted,).toBe(false,);
  });
});
