// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/resources-fixtures.ts — shared scaffolding for the extraction tests.
 *
 * Split out so `resources.test.ts` (the roll) and `resources-regen.test.ts` (the
 * lifecycle) can each stay under the size gate while seeding the SAME node. One
 * seed helper means a fixture change cannot make the two files disagree about
 * what a node looks like.
 */
import type { Kysely, } from "kysely";
import { GatheringNodeType, ItemCategory, QualityLevel, } from "../db/enums";
import { ResourceQuality, } from "../db/enums-story/resources";
import type { DB, } from "../db/schema";
import {
  insertActors,
  insertGatheringNodeDefs,
  insertGatheringNodeInstances,
  insertGatheringNodeMaterials,
  insertItems,
  insertLocations,
  insertUsers,
  insertWorlds,
} from "../test-utils/insert-helpers";
import { toDate, } from "../utils/date";

/** Fixed base instant; tests move it to sit on either side of a respawn. */
export const T0 = toDate("2026-03-01T00:00:00.000Z",);
export const WORLD = "w1";
export const LOCATION = "loc1";
export const ACTOR = "actor1";

/** A d100 at difficulty 1 always succeeds and at 100 always fails, which is how
 * the success/failure tests stay deterministic without hunting for a seed. */
export const TRIVIAL = 1;
export const IMPOSSIBLE = 100;

/** One user, world, location, and actor — the minimum an extraction touches. */
export async function seedWorld(db: Kysely<DB>,): Promise<void> {
  await insertUsers(db, "owner", "Owner", { id: "user-owner", },);
  await insertWorlds(db, "user-owner", "Test World", { id: WORLD, },);
  await insertLocations(db, WORLD, "Mine", { id: LOCATION, },);
  await insertActors(db, "Miner", { id: ACTOR, },);
}

/** Knobs for the node a given test wants. */
export interface NodeOverrides {
  difficulty?: number;
  quality?: ResourceQuality;
  /** `null` is the interesting case: an infinite node. */
  remaining?: number | null;
  respawnSeconds?: number;
}

/** Build a node with one guaranteed-drop material; returns its instance id. */
export async function seedNode(db: Kysely<DB>, overrides: NodeOverrides = {},): Promise<string> {
  const defId = await insertGatheringNodeDefs(
    db,
    WORLD,
    "Iron Vein",
    GatheringNodeType.OreVein,
    T0.toISOString(),
    T0.toISOString(),
    { respawn_time_seconds: overrides.respawnSeconds ?? 3600, rarity: QualityLevel.Common, },
  );

  const itemId = await insertItems(db, WORLD, "Iron Ore", ItemCategory.Material,);
  await insertGatheringNodeMaterials(db, defId, itemId, T0.toISOString(), {
    min_quantity: 1,
    max_quantity: 1,
    drop_chance: 1,
  },);

  const instanceId = await insertGatheringNodeInstances(db, defId, WORLD, 5, T0.toISOString(), T0.toISOString(), {
    id: "node-1",
    location_id: LOCATION,
  },);

  // The three columns migration 060 adds are not insert-helper parameters, so
  // they are written directly — which also keeps the test honest about exactly
  // which fields are the new ones.
  await db
    .updateTable("gathering_node_instances",)
    .set({
      quality: overrides.quality ?? ResourceQuality.Common,
      extraction_difficulty: overrides.difficulty ?? TRIVIAL,
      remaining_amount: overrides.remaining === undefined ? 5 : overrides.remaining,
    },)
    .where("id", "=", instanceId,)
    .execute();

  return instanceId;
}

/** The columns a test asserts on after the engine has written. */
export async function readNode(db: Kysely<DB>, instanceId: string,) {
  return await db
    .selectFrom("gathering_node_instances",)
    .select(["state", "remaining_amount", "current_uses", "respawn_at",],)
    .where("id", "=", instanceId,)
    .executeTakeFirstOrThrow();
}
