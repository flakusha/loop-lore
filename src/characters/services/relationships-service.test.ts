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
    relationshipsService = new RelationshipsService(db,);

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
});
