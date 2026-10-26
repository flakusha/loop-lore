/**
 * Relationships Service Tests
 *
 * Unit tests for character relationships, standing, trust,
 * and familiarity.
 */
import { beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { RelationshipsService, } from "./relationships-service";
import { createTestActors, } from "./test-helpers";

describe("RelationshipsService", () => {
  let db: Kysely<DB>;
  let relationshipsService: RelationshipsService;
  let testActorId1: string;
  let testActorId2: string;

  beforeAll(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    relationshipsService = RelationshipsService(db,);

    const actors = await createTestActors(db, "test-actor-rel-001",);
    testActorId1 = actors.actorId;
    const actors2 = await createTestActors(db, "test-actor-rel-002",);
    testActorId2 = actors2.actorId;
  },);

  describe("createRelationship", () => {
    it("should create a relationship", async () => {
      const relationshipId = await relationshipsService.createRelationship({
        actorId: testActorId1,
        targetActorId: testActorId2,
        relationshipType: "friend",
        standing: 50,
        trust: 70,
        familiarity: 60,
      },);

      expect(relationshipId,).toBeDefined();
    });

    it("should throw on duplicate relationship", async () => {
      try {
        await relationshipsService.createRelationship({
          actorId: testActorId1,
          targetActorId: testActorId2,
          relationshipType: "friend",
        },);

        expect(true,).toBe(false,);
      } catch (error: any) {
        expect(error.message,).toContain("already exists",);
      }
    });

    it("should create a relationship inside an ambient transaction", async () => {
      await createTestActors(db, "test-actor-rel-nested",);
      const targetId = "test-actor-rel-nested";

      // The service must reuse the caller's transaction instead of opening a
      // second one (Kysely throws) or querying through the outer handle
      // (single-connection deadlock).
      await db.transaction().execute(async (trx,) => {
        const id = await RelationshipsService(trx,).createRelationship({
          actorId: testActorId1,
          targetActorId: targetId,
          relationshipType: "ally",
        },);

        expect(id,).toBeDefined();
      },);

      const relationship = await relationshipsService.getRelationship(testActorId1, targetId,);
      expect(relationship,).toBeDefined();
    });
  });

  describe("getRelationship", () => {
    it("should get a relationship", async () => {
      const relationship = await relationshipsService.getRelationship(
        testActorId1,
        testActorId2,
      );

      expect(relationship,).toBeDefined();
      expect(relationship?.actorId,).toBe(testActorId1,);
      expect(relationship?.relationshipType,).toBe("friend",);
      expect(relationship?.standing,).toBe(50,);
    });

    it("should return undefined for non-existent", async () => {
      const relationship = await relationshipsService.getRelationship("x", "y",);
      expect(relationship,).toBeUndefined();
    });
  });

  describe("getRelationships", () => {
    it("should get all relationships for an actor", async () => {
      const relationships = await relationshipsService.getRelationships(testActorId1,);
      expect(relationships.length,).toBeGreaterThanOrEqual(1,);
    });
  });

  describe("updateRelationship", () => {
    it("should update relationship fields", async () => {
      await relationshipsService.updateRelationship(testActorId1, testActorId2, undefined, {
        standing: 75,
        trust: 85,
      },);

      const relationship = await relationshipsService.getRelationship(testActorId1, testActorId2,);
      expect(relationship?.standing,).toBe(75,);
      expect(relationship?.trust,).toBe(85,);
    });

    it("should clamp values to valid ranges", async () => {
      await relationshipsService.updateRelationship(testActorId1, testActorId2, undefined, {
        standing: 150,
        trust: -150,
        familiarity: 150,
      },);

      const relationship = await relationshipsService.getRelationship(testActorId1, testActorId2,);
      expect(relationship?.standing,).toBe(100,);
      expect(relationship?.trust,).toBe(-100,);
      expect(relationship?.familiarity,).toBe(100,);
    });
  });

  describe("deleteRelationship", () => {
    it("should delete a relationship", async () => {
      await createTestActors(db, "test-actor-rel-delete",);
      await relationshipsService.createRelationship({
        actorId: testActorId1,
        targetActorId: "test-actor-rel-delete",
        relationshipType: "rival",
      },);

      await relationshipsService.deleteRelationship(testActorId1, "test-actor-rel-delete",);
      const relationship = await relationshipsService.getRelationship(testActorId1, "test-actor-rel-delete",);
      expect(relationship,).toBeUndefined();
    });
  });

  describe("logEvent", () => {
    it("should log a relationship event and apply deltas", async () => {
      await relationshipsService.updateRelationship(testActorId1, testActorId2, undefined, {
        standing: 50,
        trust: 50,
        familiarity: 50,
      },);

      await relationshipsService.logEvent({
        actorId: testActorId1,
        targetActorId: testActorId2,
        eventType: "helped",
        standingDelta: 10,
        trustDelta: 5,
        familiarityDelta: 10,
      },);

      const relationship = await relationshipsService.getRelationship(testActorId1, testActorId2,);
      expect(relationship?.standing,).toBe(60,);
      expect(relationship?.trust,).toBe(55,);
      expect(relationship?.familiarity,).toBe(60,);
    });
  });

  describe("createRelationship concurrency (BUG-relationship-duplicate-guard-runs-before-txn-concurrent-same)", () => {
    it("yields exactly one relationship pair when the same pair is created concurrently", async () => {
      await createTestActors(db, "test-actor-rel-race-a",);
      await createTestActors(db, "test-actor-rel-race-b",);

      const results = await Promise.allSettled([
        relationshipsService.createRelationship({
          actorId: "test-actor-rel-race-a",
          targetActorId: "test-actor-rel-race-b",
          relationshipType: "friend",
        },),
        relationshipsService.createRelationship({
          actorId: "test-actor-rel-race-a",
          targetActorId: "test-actor-rel-race-b",
          relationshipType: "friend",
        },),
      ],);

      const rows = await db
        .selectFrom("character_relationships",)
        .selectAll()
        .where("actor_id", "=", "test-actor-rel-race-a",)
        .where("target_actor_id", "=", "test-actor-rel-race-b",)
        .execute();

      const fulfilled = results.filter((r,) => r.status === "fulfilled");
      expect(fulfilled.length,).toBe(1,);
      expect(rows.length,).toBe(1,);
    });
  });

  describe("explicit world scope (BUG-withworldid-undefined-means-no-filter)", () => {
    it("omitted worldId reads and mutates only the global row, never an arbitrary world's", async () => {
      await createTestActors(db, "test-actor-rel-scope-a",);
      await createTestActors(db, "test-actor-rel-scope-b",);
      const a = "test-actor-rel-scope-a";
      const b = "test-actor-rel-scope-b";
      const now = new Date().toISOString();

      // The world FKs require a real users row for the owner.
      await insertUsers(db, "test-user-rel-scope", "Scope Owner", { id: "test-user-rel-scope", } as never,);
      await insertWorlds(db, "test-user-rel-scope", "Scope World", { id: "world-A", },);

      // Same pair in a specific world AND globally.
      await db.insertInto("character_relationships",).values({
        id: "rel-scope-world",
        actor_id: a,
        target_actor_id: b,
        world_id: "world-A",
        relationship_type: "rival",
        standing: 10,
        trust: 10,
        familiarity: 0,
        is_bidirectional: 0,
        metadata: "{}",
        created_at: now,
        updated_at: now,
      },).execute();

      await db.insertInto("character_relationships",).values({
        id: "rel-scope-global",
        actor_id: a,
        target_actor_id: b,
        world_id: null,
        relationship_type: "friend",
        standing: 50,
        trust: 50,
        familiarity: 0,
        is_bidirectional: 0,
        metadata: "{}",
        created_at: now,
        updated_at: now,
      },).execute();

      // Read without worldId resolves the global row deterministically.
      const global = await relationshipsService.getRelationship(a, b,);
      expect(global?.id,).toBe("rel-scope-global",);

      // Read WITH worldId resolves that world's row.
      const worldRow = await relationshipsService.getRelationship(a, b, "world-A",);
      expect(worldRow?.id,).toBe("rel-scope-world",);

      // Update without worldId mutates only the global row.
      await relationshipsService.updateRelationship(a, b, undefined, { standing: 99, },);
      const rows = await db.selectFrom("character_relationships",).selectAll()
        .where("actor_id", "=", a,).where("target_actor_id", "=", b,).execute();

      expect(rows.find((r,) => r.id === "rel-scope-global")?.standing,).toBe(99,);
      expect(rows.find((r,) => r.id === "rel-scope-world")?.standing,).toBe(10,);

      // Delete without worldId removes only the global row.
      await relationshipsService.deleteRelationship(a, b, undefined,);
      const after = await db.selectFrom("character_relationships",).selectAll()
        .where("actor_id", "=", a,).where("target_actor_id", "=", b,).execute();

      expect(after.map((r,) => r.id),).toEqual(["rel-scope-world",],);
    });
  });
});
