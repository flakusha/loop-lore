/**
 * Character World Setup Service Tests
 *
 * Unit tests for the per-world character setup bundle (CRUD, idempotent
 * upsert, resolution precedence, and seed-hook idempotency).
 */
import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { WorldStateService, } from "../../story/world-state";
import { createTestDb, } from "../../test-utils/create-test-db";
import { createTestActors, createTestWorld, } from "../services/test-helpers";
import { CharacterWorldSetupService, } from "./index";

describe("CharacterWorldSetupService", () => {
  let db: Kysely<DB>;
  let service: ReturnType<typeof CharacterWorldSetupService>;
  let actorId: string;
  const worldId = "test-world-001";

  beforeAll(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    service = CharacterWorldSetupService(db,);

    const { actorId: id, } = await createTestActors(db,);
    actorId = id;
    await createTestWorld(db, worldId,);

    // Give the base actor a scenario + system prompt to exercise resolution.
    await db
      .updateTable("actors",)
      .set({ scenario: "base scenario", system_prompt: "base prompt", },)
      .where("id", "=", actorId,)
      .execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  describe("upsertWorldSetup", () => {
    it("creates a setup row on first call", async () => {
      const row = await service.upsertWorldSetup({
        actorId,
        worldId,
        startingInventory: [{ item_id: "sword", quantity: 1, },],
        backstory: "orphan raised by wolves",
      },);

      expect(row.actor_id,).toBe(actorId,);
      expect(row.world_id,).toBe(worldId,);
      expect(row.backstory,).toBe("orphan raised by wolves",);
    });

    it("is idempotent — merges into the existing row instead of duplicating", async () => {
      await service.upsertWorldSetup({
        actorId,
        worldId,
        scenarioOverride: "world scenario",
      },);

      const rows = await db
        .selectFrom("character_world_setup",)
        .selectAll()
        .where("actor_id", "=", actorId,)
        .where("world_id", "=", worldId,)
        .execute();

      expect(rows.length,).toBe(1,);
      expect(rows[0]?.scenario_override,).toBe("world scenario",);
      // The earlier backstory must survive the merge.
      expect(rows[0]?.backstory,).toBe("orphan raised by wolves",);
    });
  });

  describe("getWorldSetup", () => {
    it("returns the setup row for an actor+world", async () => {
      const row = await service.getWorldSetup(actorId, worldId,);
      expect(row?.actor_id,).toBe(actorId,);
    });

    it("returns undefined when no row exists", async () => {
      const row = await service.getWorldSetup("missing-actor", worldId,);
      expect(row,).toBeUndefined();
    });
  });

  describe("updateWorldSetup", () => {
    it("updates fields and leaves unspecified fields intact", async () => {
      const row = await service.updateWorldSetup(actorId, worldId, {
        systemPromptOverride: "world prompt",
      },);
      expect(row?.system_prompt_override,).toBe("world prompt",);
      expect(row?.scenario_override,).toBe("world scenario",);
    });

    it("returns undefined when no row exists", async () => {
      const row = await service.updateWorldSetup("missing-actor", worldId, { backstory: "x", },);
      expect(row,).toBeUndefined();
    });
  });

  describe("resolveCharacterWorldSetup", () => {
    it("merges base setup with world overrides (override wins)", async () => {
      const resolved = await service.resolveCharacterWorldSetup(actorId, worldId,);

      expect(resolved?.baseScenario,).toBe("base scenario",);
      expect(resolved?.scenario,).toBe("world scenario",);
      expect(resolved?.baseSystemPrompt,).toBe("base prompt",);
      expect(resolved?.systemPrompt,).toBe("world prompt",);
      expect(resolved?.backstory,).toBe("orphan raised by wolves",);
      expect(resolved?.startingInventory.length,).toBe(1,);
      expect(resolved?.startingInventory[0]?.item_id,).toBe("sword",);
    });

    it("falls back to base values when no override is set", async () => {
      // Fresh actor+world with no setup row → base values, empty collections.
      const { actorId: otherActor, } = await createTestActors(db, "test-actor-002",);
      await db
        .updateTable("actors",)
        .set({ scenario: "other scenario", },)
        .where("id", "=", otherActor,)
        .execute();

      const resolved = await service.resolveCharacterWorldSetup(otherActor, worldId,);
      expect(resolved?.scenario,).toBe("other scenario",);
      expect(resolved?.backstory,).toBeNull();
      expect(resolved?.startingInventory,).toEqual([],);
      expect(resolved?.loreEntries,).toEqual([],);
    });

    it("returns undefined for a missing actor", async () => {
      const resolved = await service.resolveCharacterWorldSetup("missing-actor", worldId,);
      expect(resolved,).toBeUndefined();
    });
  });

  describe("deleteWorldSetup", () => {
    it("deletes the row and returns true", async () => {
      const { actorId: doomed, } = await createTestActors(db, "test-actor-003",);
      await service.upsertWorldSetup({ actorId: doomed, worldId, },);
      expect(await service.deleteWorldSetup(doomed, worldId,),).toBe(true,);
      expect(await service.getWorldSetup(doomed, worldId,),).toBeUndefined();
    });

    it("returns false when no row exists", async () => {
      expect(await service.deleteWorldSetup("missing-actor", worldId,),).toBe(false,);
    });
  });

  describe("initializeCharacterWorldSetup (seed hook)", () => {
    it("seeds an empty setup row per actor+world and is idempotent", async () => {
      const worldState = new WorldStateService(db,);
      const first = await worldState.initializeCharacterWorldSetup(worldId,);
      const second = await worldState.initializeCharacterWorldSetup(worldId,);

      // No new rows on re-run; seeding is idempotent.
      expect(second,).toBe(0,);
      expect(first,).toBeGreaterThanOrEqual(1,);

      // Each actor has at most one setup row for this world (no duplicates).
      const rows = await db
        .selectFrom("character_world_setup",)
        .select("actor_id",)
        .where("world_id", "=", worldId,)
        .execute();
      const actorIds = rows.map((r,) => r.actor_id);
      expect(new Set(actorIds,).size,).toBe(actorIds.length,);
    });
  });
});
