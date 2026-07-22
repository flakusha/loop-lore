/**
 * Character Traits Service Tests
 *
 * Unit tests for character permanent traits, world traits,
 * and location traits management.
 */
import { beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { createTestActors, createTestLocation, createTestWorld, } from "./test-helpers";
import { TraitsService, } from "./traits-service";

describe("TraitsService", () => {
  let db: Kysely<DB>;
  let traitsService: TraitsService;
  let testActorId: string;

  beforeAll(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    traitsService = new TraitsService(db,);

    const { actorId, } = await createTestActors(db,);
    testActorId = actorId;

    await createTestWorld(db, "test-world-001",);
    await createTestLocation(db, "test-world-001", "test-location-001",);
  },);

  describe("Permanent Traits", () => {
    it("should create a permanent trait", async () => {
      const traitId = await traitsService.createPermanentTrait({
        actorId: testActorId,
        category: "identity",
        name: "species",
        value: "elf",
      },);
      expect(traitId,).toBeDefined();
    });

    it("should get a permanent trait by name", async () => {
      const trait = await traitsService.getPermanentTrait(testActorId, "species",);
      expect(trait?.trait_name,).toBe("species",);
      expect(trait?.trait_value,).toBe("elf",);
    });

    it("should get all permanent traits", async () => {
      const traits = await traitsService.getPermanentTraits(testActorId,);
      expect(traits.length,).toBeGreaterThanOrEqual(1,);
    });

    it("should update a permanent trait", async () => {
      await traitsService.updatePermanentTrait(testActorId, {
        name: "species",
        value: "dark elf",
      },);
      const trait = await traitsService.getPermanentTrait(testActorId, "species",);
      expect(trait?.trait_value,).toBe("dark elf",);
    });

    it("should delete a permanent trait", async () => {
      await traitsService.createPermanentTrait({
        actorId: testActorId,
        category: "social",
        name: "friendliness",
        value: "75",
      },);
      await traitsService.deletePermanentTrait(testActorId, "friendliness",);
      const trait = await traitsService.getPermanentTrait(testActorId, "friendliness",);
      expect(trait,).toBeUndefined();
    });

    it("should throw on duplicate permanent trait", async () => {
      try {
        await traitsService.createPermanentTrait({
          actorId: testActorId,
          category: "identity",
          name: "species",
          value: "human",
        },);
        expect(true,).toBe(false,); // Should not reach
      } catch (error: any) {
        expect(error.message,).toContain("already exists",);
      }
    });
  });

  describe("World Traits", () => {
    it("should create a world trait", async () => {
      const traitId = await traitsService.createWorldTrait({
        actorId: testActorId,
        worldId: "test-world-001",
        category: "equipment",
        name: "clothes",
        value: "royal gown",
      },);
      expect(traitId,).toBeDefined();
    });

    it("should get a world trait by name", async () => {
      const trait = await traitsService.getWorldTrait(testActorId, "test-world-001", "clothes",);
      expect(trait?.trait_value,).toBe("royal gown",);
    });

    it("should get all world traits", async () => {
      const traits = await traitsService.getWorldTraits(testActorId, "test-world-001",);
      expect(traits.length,).toBeGreaterThanOrEqual(1,);
    });

    it("should update a world trait", async () => {
      await traitsService.updateWorldTrait(testActorId, "test-world-001", {
        name: "clothes",
        value: "leather armor",
      },);
      const trait = await traitsService.getWorldTrait(testActorId, "test-world-001", "clothes",);
      expect(trait?.trait_value,).toBe("leather armor",);
    });

    it("should delete a world trait", async () => {
      await traitsService.deleteWorldTrait(testActorId, "test-world-001", "clothes",);
      const trait = await traitsService.getWorldTrait(testActorId, "test-world-001", "clothes",);
      expect(trait,).toBeUndefined();
    });
  });

  describe("Location Traits", () => {
    it("should create a location trait", async () => {
      const traitId = await traitsService.createLocationTrait({
        actorId: testActorId,
        locationId: "test-location-001",
        name: "comfort_level",
        value: "80",
        bonus: 10,
        penalty: 0,
        effects: { warmth: true, },
      },);
      expect(traitId,).toBeDefined();
    });

    it("should get a location trait by name", async () => {
      const trait = await traitsService.getLocationTrait(testActorId, "test-location-001", "comfort_level",);
      expect(trait?.trait_value,).toBe("80",);
      expect(trait?.bonus,).toBe(10,);
    });

    it("should get all location traits", async () => {
      const traits = await traitsService.getLocationTraits(testActorId, "test-location-001",);
      expect(traits.length,).toBeGreaterThanOrEqual(1,);
    });

    it("should update a location trait", async () => {
      await traitsService.updateLocationTrait(testActorId, "test-location-001", {
        name: "comfort_level",
        value: "90",
        bonus: 15,
        penalty: 0,
        effects: { warmth: true, luxury: true, },
      },);
      const trait = await traitsService.getLocationTrait(testActorId, "test-location-001", "comfort_level",);
      expect(trait?.trait_value,).toBe("90",);
      expect(trait?.bonus,).toBe(15,);
    });

    it("should delete a location trait", async () => {
      await traitsService.deleteLocationTrait(testActorId, "test-location-001", "comfort_level",);
      const trait = await traitsService.getLocationTrait(testActorId, "test-location-001", "comfort_level",);
      expect(trait,).toBeUndefined();
    });
  });

  describe("getAllTraits", () => {
    it("should get all traits for an actor", async () => {
      await traitsService.createPermanentTrait({
        actorId: testActorId,
        category: "physical",
        name: "size",
        value: "medium",
      },);

      const allTraits = await traitsService.getAllTraits(testActorId,);
      expect(allTraits.permanent.length,).toBeGreaterThanOrEqual(1,);
    });
  });
});
