// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for WorldLocationTraitsService against a real in-memory DB. */
import { describe, expect, it, } from "bun:test";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertLocations, insertUsers, insertWorlds, } from "../../../test-utils/insert-helpers";
import { WorldLocationTraitsService, } from "./index";

async function seed() {
  const { db, } = await createTestDb();
  await insertUsers(db, "owner", "Owner", { id: "owner-1", },);
  const actorId = await insertActors(db, "Actor", { id: "actor-1", },);
  const worldId = await insertWorlds(db, "owner-1", "World", { id: "world-1", },);
  const locationId = await insertLocations(db, worldId, "Tavern", { id: "loc-1", },);
  return { db, actorId, worldId, locationId, };
}

describe("WorldLocationTraitsService — world traits", () => {
  it("createWorldTrait persists and getWorldTraits retrieves", async () => {
    const { db, actorId, worldId, } = await seed();
    const service = new WorldLocationTraitsService(db,);
    const trait = await service.createWorldTrait({
      actor_id: actorId,
      world_id: worldId,
      trait_category: "cultural",
      trait_name: "festive",
      trait_value: "high",
    },);

    expect(trait.id,).toBeTruthy();
    const rows = await service.getWorldTraits(actorId, worldId,);
    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.trait_name,).toBe("festive",);
  });

  it("getWorldTraits returns empty array on empty state", async () => {
    const { db, actorId, worldId, } = await seed();
    const service = new WorldLocationTraitsService(db,);
    expect(await service.getWorldTraits(actorId, worldId,),).toEqual([],);
  });

  it("updateWorldTrait applies partial updates; unknown id returns undefined", async () => {
    const { db, actorId, worldId, } = await seed();
    const service = new WorldLocationTraitsService(db,);
    const trait = await service.createWorldTrait({
      actor_id: actorId,
      world_id: worldId,
      trait_category: "cultural",
      trait_name: "a",
      trait_value: "1",
    },);

    const updated = await service.updateWorldTrait(trait.id, { trait_value: "2", },);
    expect(updated?.trait_value,).toBe("2",);
    expect(updated?.trait_name,).toBe("a",);
    expect(await service.updateWorldTrait("nope", { trait_value: "x", },),).toBeUndefined();
  });

  it("deleteWorldTrait removes the row; unknown id returns false", async () => {
    const { db, actorId, worldId, } = await seed();
    const service = new WorldLocationTraitsService(db,);
    const trait = await service.createWorldTrait({
      actor_id: actorId,
      world_id: worldId,
      trait_category: "cultural",
      trait_name: "a",
      trait_value: "1",
    },);

    expect(await service.deleteWorldTrait(trait.id,),).toBe(true,);
    expect(await service.getWorldTraits(actorId, worldId,),).toEqual([],);
    expect(await service.deleteWorldTrait("nope",),).toBe(false,);
  });
});

describe("WorldLocationTraitsService — location traits", () => {
  it("createLocationTrait applies numeric and JSON defaults", async () => {
    const { db, actorId, locationId, } = await seed();
    const service = new WorldLocationTraitsService(db,);
    const trait = await service.createLocationTrait({
      actor_id: actorId,
      location_id: locationId,
      trait_name: "drafty",
      trait_value: "cold",
    },);

    expect(trait.bonus,).toBe(0,);
    expect(trait.penalty,).toBe(0,);
    expect(trait.effects,).toBe("{}",);
    expect(trait.equipment_override,).toBe("{}",);
  });

  it("createLocationTrait stores explicit values", async () => {
    const { db, actorId, locationId, } = await seed();
    const service = new WorldLocationTraitsService(db,);
    const trait = await service.createLocationTrait({
      actor_id: actorId,
      location_id: locationId,
      trait_name: "drafty",
      trait_value: "cold",
      bonus: 2,
      penalty: 3,
      effects: { cold_resist: 2, },
      equipment_override: { cloak: "warm", },
    },);

    expect(trait.bonus,).toBe(2,);
    expect(trait.penalty,).toBe(3,);
    expect(trait.effects,).toBe(JSON.stringify({ cold_resist: 2, },),);
    expect(trait.equipment_override,).toBe(JSON.stringify({ cloak: "warm", },),);
  });

  it("getLocationTraits returns empty array on empty state", async () => {
    const { db, actorId, locationId, } = await seed();
    const service = new WorldLocationTraitsService(db,);
    expect(await service.getLocationTraits(actorId, locationId,),).toEqual([],);
  });

  it("updateLocationTrait applies partial updates; unknown id returns undefined", async () => {
    const { db, actorId, locationId, } = await seed();
    const service = new WorldLocationTraitsService(db,);
    const trait = await service.createLocationTrait({
      actor_id: actorId,
      location_id: locationId,
      trait_name: "a",
      trait_value: "1",
      bonus: 1,
    },);

    const updated = await service.updateLocationTrait(trait.id, { bonus: 5, },);
    expect(updated?.bonus,).toBe(5,);
    expect(updated?.trait_name,).toBe("a",);
    expect(await service.updateLocationTrait("nope", { bonus: 1, },),).toBeUndefined();
  });

  it("deleteLocationTrait removes the row; unknown id returns false", async () => {
    const { db, actorId, locationId, } = await seed();
    const service = new WorldLocationTraitsService(db,);
    const trait = await service.createLocationTrait({
      actor_id: actorId,
      location_id: locationId,
      trait_name: "a",
      trait_value: "1",
    },);

    expect(await service.deleteLocationTrait(trait.id,),).toBe(true,);
    expect(await service.getLocationTraits(actorId, locationId,),).toEqual([],);
    expect(await service.deleteLocationTrait("nope",),).toBe(false,);
  });
});

describe("WorldLocationTraitsService — aggregate", () => {
  it("getAllTraitsForActor returns empty state", async () => {
    const { db, actorId, } = await seed();
    const service = new WorldLocationTraitsService(db,);
    expect(await service.getAllTraitsForActor(actorId,),).toEqual({ worldTraits: [], locationTraits: [], },);
  });

  it("getAllTraitsForActor returns both trait sets for the actor", async () => {
    const { db, actorId, worldId, locationId, } = await seed();
    const service = new WorldLocationTraitsService(db,);
    await service.createWorldTrait({
      actor_id: actorId,
      world_id: worldId,
      trait_category: "cultural",
      trait_name: "w",
      trait_value: "1",
    },);

    await service.createLocationTrait({
      actor_id: actorId,
      location_id: locationId,
      trait_name: "l",
      trait_value: "2",
    },);

    const all = await service.getAllTraitsForActor(actorId,);
    expect(all.worldTraits,).toHaveLength(1,);
    expect(all.locationTraits,).toHaveLength(1,);
    expect(all.worldTraits[0]!.trait_name,).toBe("w",);
    expect(all.locationTraits[0]!.trait_name,).toBe("l",);
  });

  it("getAllTraitsForActor isolates traits per actor", async () => {
    const { db, actorId, worldId, } = await seed();
    const otherActor = await insertActors(db, "Other",);
    const service = new WorldLocationTraitsService(db,);
    await service.createWorldTrait({
      actor_id: actorId,
      world_id: worldId,
      trait_category: "cultural",
      trait_name: "mine",
      trait_value: "1",
    },);

    await service.createWorldTrait({
      actor_id: otherActor,
      world_id: worldId,
      trait_category: "magical",
      trait_name: "theirs",
      trait_value: "2",
    },);

    const all = await service.getAllTraitsForActor(actorId,);
    expect(all.worldTraits,).toHaveLength(1,);
    expect(all.worldTraits[0]!.trait_name,).toBe("mine",);
  });
});
