// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for world-traits dispatchers against a real in-memory DB. */
import { describe, expect, it, } from "bun:test";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertUsers, insertWorlds, } from "../../../test-utils/insert-helpers";
import {
  createWorldTrait,
  deleteWorldTrait,
  getWorldTraits,
  updateWorldTrait,
} from "./world-traits";

async function seed() {
  const { db, } = await createTestDb();
  await insertUsers(db, "owner", "Owner", { id: "owner-1", },);
  const actorId = await insertActors(db, "Actor", { id: "actor-1", },);
  const worldId = await insertWorlds(db, "owner-1", "World", { id: "world-1", },);
  return { db, actorId, worldId, };
}

describe("createWorldTrait", () => {
  it("inserts a trait row and returns it with timestamps", async () => {
    const { db, actorId, worldId, } = await seed();
    const trait = await createWorldTrait(db, {
      actor_id: actorId,
      world_id: worldId,
      trait_category: "environmental",
      trait_name: "humid",
      trait_value: "high",
    },);

    expect(trait.id,).toBeTruthy();
    expect(trait.actor_id,).toBe(actorId,);
    expect(trait.world_id,).toBe(worldId,);
    expect(trait.trait_category,).toBe("environmental",);
    expect(trait.created_at,).toBeTruthy();
    expect(trait.updated_at,).toBe(trait.created_at,);
    const rows = await getWorldTraits(db, actorId, worldId,);
    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.trait_name,).toBe("humid",);
  });
});

describe("getWorldTraits", () => {
  it("returns empty array when actor has no traits", async () => {
    const { db, actorId, worldId, } = await seed();
    expect(await getWorldTraits(db, actorId, worldId,),).toEqual([],);
  });

  it("returns only traits for the given actor and world, ordered by category", async () => {
    const { db, actorId, worldId, } = await seed();
    await createWorldTrait(db, {
      actor_id: actorId,
      world_id: worldId,
      trait_category: "cultural",
      trait_name: "a",
      trait_value: "1",
    },);

    await createWorldTrait(db, {
      actor_id: actorId,
      world_id: worldId,
      trait_category: "environmental",
      trait_name: "b",
      trait_value: "2",
    },);

    const otherWorld = await insertWorlds(db, "owner-1", "Other",);
    await createWorldTrait(db, {
      actor_id: actorId,
      world_id: otherWorld,
      trait_category: "magical",
      trait_name: "c",
      trait_value: "3",
    },);

    const rows = await getWorldTraits(db, actorId, worldId,);
    expect(rows.map((row,) => row.trait_category),).toEqual(["cultural", "environmental",],);
  });
});

describe("updateWorldTrait", () => {
  it("applies partial updates and bumps updated_at", async () => {
    const { db, actorId, worldId, } = await seed();
    const trait = await createWorldTrait(db, {
      actor_id: actorId,
      world_id: worldId,
      trait_category: "cultural",
      trait_name: "a",
      trait_value: "1",
    },);

    const updated = await updateWorldTrait(db, trait.id, { trait_value: "9", },);
    expect(updated?.trait_value,).toBe("9",);
    expect(updated?.trait_name,).toBe("a",);
    expect(updated?.trait_category,).toBe("cultural",);
    expect(updated!.updated_at >= trait.updated_at,).toBe(true,);
  });

  it("updates all fields at once", async () => {
    const { db, actorId, worldId, } = await seed();
    const trait = await createWorldTrait(db, {
      actor_id: actorId,
      world_id: worldId,
      trait_category: "cultural",
      trait_name: "a",
      trait_value: "1",
    },);

    const updated = await updateWorldTrait(db, trait.id, {
      trait_category: "magical",
      trait_name: "b",
      trait_value: "2",
    },);

    expect(updated,).toMatchObject({ trait_category: "magical", trait_name: "b", trait_value: "2", },);
  });

  it("returns undefined for unknown id", async () => {
    const { db, } = await seed();
    expect(await updateWorldTrait(db, "nope", { trait_value: "x", },),).toBeUndefined();
  });
});

describe("deleteWorldTrait", () => {
  it("deletes an existing trait and reports true", async () => {
    const { db, actorId, worldId, } = await seed();
    const trait = await createWorldTrait(db, {
      actor_id: actorId,
      world_id: worldId,
      trait_category: "cultural",
      trait_name: "a",
      trait_value: "1",
    },);

    expect(await deleteWorldTrait(db, trait.id,),).toBe(true,);
    expect(await getWorldTraits(db, actorId, worldId,),).toEqual([],);
  });

  it("returns false for unknown id", async () => {
    const { db, } = await seed();
    expect(await deleteWorldTrait(db, "nope",),).toBe(false,);
  });
});
