// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
//
// Round-trip cover for the loop-lore native character-systems bundle:
// location-scoped traits, per-world avatar config, and the world-setup bundle.

import { beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertCharacterLocationTraits,
  insertCharacterWorldSetup,
  insertWorldAvatarConfig,
} from "../../test-utils/insert-helpers";
import { importCharacterSystems, } from "../importers/character-systems";
import { createTestActors, createTestLocation, createTestWorld, } from "../services/test-helpers";
import { exportCharacterSystems, } from "./character-systems";
import type { CharacterSystemsExport, ExportedWorldAvatarConfig, } from "./character-systems";

/**
 * Copy a bundle with one hand-edited per-world avatar entry. The entry is
 * accepted as `unknown` because the import path must survive a bundle that no
 * longer matches the exported shape; the cast is how the test hands it one.
 * @param bundle - Source bundle
 * @param entry - Replacement `worldConfigs` entry, possibly malformed
 * @returns the tampered copy
 */
function withWorldConfig(bundle: CharacterSystemsExport, entry: unknown,): CharacterSystemsExport {
  const worldConfigs = [entry,] as ExportedWorldAvatarConfig[];

  return { ...bundle, avatars: { ...bundle.avatars!, worldConfigs, }, };
}

const NOW = "2026-01-01T00:00:00.000Z";
const WORLD_ID = "cs-world";
const OTHER_WORLD_ID = "cs-other-world";
const LOCATION_ID = "cs-location";

let db: Kysely<DB>;
let actorId: string;

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());
  ({ actorId, } = await createTestActors(db, "cs-actor",));
  await createTestWorld(db, WORLD_ID,);
  await createTestWorld(db, OTHER_WORLD_ID,);
  await createTestLocation(db, WORLD_ID, LOCATION_ID,);

  await insertCharacterLocationTraits(db, actorId, LOCATION_ID, "surefooted", "+2 climbing", NOW, NOW, {
    bonus: 2,
    penalty: -1,
    effects: JSON.stringify({ terrain: "cliff", },),
  },);

  await insertWorldAvatarConfig(db, WORLD_ID, actorId, NOW, NOW, {
    selection_rule_override: "mood_first",
    weights_override: JSON.stringify({ mood: 0.9, },),
  },);

  await insertCharacterWorldSetup(db, actorId, WORLD_ID, {
    starting_inventory: JSON.stringify([{ itemId: "rope", quantity: 1, },],),
    lore_entries: "[]",
    backstory: "Grew up on the cliffs.",
    initial_state: "{}",
  },);
},);

describe("exportCharacterSystems", () => {
  test("exports location traits with their locationId", async () => {
    const bundle = await exportCharacterSystems(db, actorId, WORLD_ID,);

    expect(bundle.traits?.location,).toHaveLength(1,);
    expect(bundle.traits?.location[0],).toMatchObject({
      locationId: LOCATION_ID,
      name: "surefooted",
      value: "+2 climbing",
      bonus: 2,
      penalty: -1,
    },);
  });

  test("skips locations outside the requested world", async () => {
    const otherLocation = await createTestLocation(db, OTHER_WORLD_ID, "cs-other-location",);
    await insertCharacterLocationTraits(db, actorId, otherLocation, "desert-born", "+1 heat", NOW, NOW,);

    const bundle = await exportCharacterSystems(db, actorId, WORLD_ID,);
    const names = (bundle.traits?.location ?? []).map((trait,) => trait.name);
    expect(names,).toEqual(["surefooted",],);

    // Keep the fixture set stable for the round-trip block below.
    await db
      .deleteFrom("character_location_traits",)
      .where("location_id", "=", otherLocation,)
      .execute();
  });

  test("writes the per-world avatar config into worldConfigs", async () => {
    const bundle = await exportCharacterSystems(db, actorId, WORLD_ID,);

    expect(bundle.avatars?.worldConfigs,).toHaveLength(1,);
    expect(bundle.avatars?.worldConfigs?.[0],).toMatchObject({
      worldId: WORLD_ID,
      selectionRule: "mood_first",
      weights: { mood: 0.9, },
    },);
  });

  test("names the source world on the world-setup bundle", async () => {
    const bundle = await exportCharacterSystems(db, actorId, WORLD_ID,);

    expect(bundle.worldSetup?.worldId,).toBe(WORLD_ID,);
    expect(bundle.worldSetup?.backstory,).toBe("Grew up on the cliffs.",);
  });
});

describe("character-systems round trip", () => {
  test("re-import restores location traits and the avatar world config", async () => {
    const bundle = await exportCharacterSystems(db, actorId, WORLD_ID,);

    // Wipe the rows the re-import is meant to recreate.
    await db.deleteFrom("character_location_traits",).where("actor_id", "=", actorId,).execute();
    await db.deleteFrom("world_avatar_config",).where("actor_id", "=", actorId,).execute();

    const result = await importCharacterSystems(db, actorId, bundle, WORLD_ID,);
    expect(result.errors,).toEqual([],);
    expect(result.traitsImported,).toBe(1,);

    const trait = await db
      .selectFrom("character_location_traits",)
      .selectAll()
      .where("actor_id", "=", actorId,)
      .where("location_id", "=", LOCATION_ID,)
      .executeTakeFirstOrThrow();

    expect(trait.trait_name,).toBe("surefooted",);
    expect(trait.trait_value,).toBe("+2 climbing",);
    expect(trait.bonus,).toBe(2,);
    expect(trait.penalty,).toBe(-1,);
    expect(JSON.parse(trait.effects ?? "{}",),).toEqual({ terrain: "cliff", },);

    const config = await db
      .selectFrom("world_avatar_config",)
      .selectAll()
      .where("actor_id", "=", actorId,)
      .where("world_id", "=", WORLD_ID,)
      .executeTakeFirstOrThrow();

    expect(config.selection_rule_override,).toBe("mood_first",);
  });

  test("rejects a world-avatar entry with an unknown selection rule", async () => {
    const bundle = await exportCharacterSystems(db, actorId, WORLD_ID,);
    const tampered = withWorldConfig(bundle, {
      worldId: WORLD_ID,
      // Deliberately outside AvatarSelectionRule: a hand-edited bundle can
      // carry anything, and the importer must report it rather than store it.
      selectionRule: "not-a-rule",
      weights: { mood: 0.9, },
    },);

    const result = await importCharacterSystems(db, actorId, tampered, WORLD_ID,);

    expect(result.errors,).toContain("Skipped malformed avatar world config entry.",);
    const stored = await db
      .selectFrom("world_avatar_config",)
      .select(["selection_rule_override",],)
      .where("actor_id", "=", actorId,)
      .where("world_id", "=", WORLD_ID,)
      .executeTakeFirstOrThrow();

    expect(stored.selection_rule_override,).toBe("mood_first",);
  });

  test("rejects a world-avatar entry whose weights are not numbers", async () => {
    const bundle = await exportCharacterSystems(db, actorId, WORLD_ID,);
    const tampered = withWorldConfig(bundle, {
      worldId: WORLD_ID,
      selectionRule: "mood_first",
      weights: { mood: "high", },
    },);

    const result = await importCharacterSystems(db, actorId, tampered, WORLD_ID,);

    expect(result.errors,).toContain("Skipped malformed avatar world config entry.",);
  });

  test("refuses a world-setup bundle exported from a different world", async () => {
    const bundle = await exportCharacterSystems(db, actorId, WORLD_ID,);

    const result = await importCharacterSystems(db, actorId, bundle, OTHER_WORLD_ID,);

    expect(result.errors.some((error,) => error.includes("belongs to world",)),).toBe(true,);
    expect(result.worldSetupImported,).toBe(false,);
    const rows = await db
      .selectFrom("character_world_setup",)
      .select(["world_id",],)
      .where("actor_id", "=", actorId,)
      .where("world_id", "=", OTHER_WORLD_ID,)
      .execute();

    expect(rows,).toEqual([],);
  });
});
