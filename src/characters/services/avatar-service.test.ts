/**
 * Avatar Service Tests
 *
 * Unit tests for character avatars with context-aware selection.
 */
import { beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { AvatarService, } from "./avatar-service";
import { createTestActors, } from "./test-helpers";

describe("AvatarService", () => {
  let db: Kysely<DB>;
  let avatarService: AvatarService;
  let testActorId: string;
  let testAssetId1: string;
  let testAssetId2: string;

  beforeAll(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    avatarService = new AvatarService(db,);

    const { actorId, } = await createTestActors(db, "test-actor-avatar-001",);
    testActorId = actorId;

    // Create test assets
    testAssetId1 = "test-asset-avatar-001";
    testAssetId2 = "test-asset-avatar-002";
    await db
      .insertInto("assets",)
      .values([
        {
          id: testAssetId1,
          owner_id: "test-user",
          filename: "avatar1.png",
          mime_type: "image/png",
          asset_type: "image",
          size_bytes: 1024,
          storage_path: "/test/avatar1.png",
          storage_backend: "local",
          visibility: "private",
        },
        {
          id: testAssetId2,
          owner_id: "test-user",
          filename: "avatar2.png",
          mime_type: "image/png",
          asset_type: "image",
          size_bytes: 2048,
          storage_path: "/test/avatar2.png",
          storage_backend: "local",
          visibility: "private",
        },
      ],)
      .execute();
  },);

  describe("createAvatar", () => {
    it("should create an avatar", async () => {
      const avatarId = await avatarService.createAvatar({
        actorId: testActorId,
        assetId: testAssetId1,
        label: "Happy expression",
        tags: { emotion: "happy", },
        isPrimary: true,
        sortOrder: 0,
      },);
      expect(avatarId,).toBeDefined();
    });
  });

  describe("getAvatars", () => {
    it("should get all avatars for an actor", async () => {
      const avatars = await avatarService.getAvatars(testActorId,);
      expect(avatars.length,).toBeGreaterThanOrEqual(1,);
      expect(avatars[0]?.label,).toBe("Happy expression",);
    });
  });

  describe("getAvatar", () => {
    it("should get a specific avatar", async () => {
      const avatars = await avatarService.getAvatars(testActorId,);
      const avatar = await avatarService.getAvatar(avatars[0]?.id ?? "",);
      expect(avatar,).toBeDefined();
      expect(avatar?.actorId,).toBe(testActorId,);
    });

    it("should return undefined for non-existent avatar", async () => {
      const avatar = await avatarService.getAvatar("non-existent",);
      expect(avatar,).toBeUndefined();
    });
  });

  describe("updateAvatar", () => {
    it("should update avatar fields", async () => {
      const avatars = await avatarService.getAvatars(testActorId,);
      const avatarId = avatars[0]?.id;
      if (!avatarId) { throw new Error("No avatar found",); }

      await avatarService.updateAvatar(avatarId, {
        label: "Updated label",
        sortOrder: 5,
      },);
      const updated = await avatarService.getAvatar(avatarId,);
      expect(updated?.label,).toBe("Updated label",);
      expect(updated?.sortOrder,).toBe(5,);
    });
  });

  describe("selectAvatar", () => {
    it("should select avatar based on emotion context", async () => {
      await avatarService.createAvatar({
        actorId: testActorId,
        assetId: testAssetId2,
        label: "Sad expression",
        tags: { emotion: "sad", },
        isPrimary: false,
        sortOrder: 1,
      },);

      const avatar = await avatarService.selectAvatar(testActorId, {
        emotion: "happy",
      },);
      expect(avatar,).toBeDefined();
      expect(avatar?.tags.emotion,).toBe("happy",);
    });

    it("should fall back to primary avatar when no match", async () => {
      const avatar = await avatarService.selectAvatar(testActorId, {
        emotion: "angry",
      },);
      expect(avatar,).toBeDefined();
      expect(avatar?.isPrimary,).toBe(true,);
    });
  });

  describe("deleteAvatar", () => {
    it("should delete an avatar", async () => {
      const avatars = await avatarService.getAvatars(testActorId,);
      const avatarId = avatars[avatars.length - 1]?.id;
      if (!avatarId) { throw new Error("No avatar found",); }

      await avatarService.deleteAvatar(avatarId,);
      const deleted = await avatarService.getAvatar(avatarId,);
      expect(deleted,).toBeUndefined();
    });
  });

  describe("Avatar Config", () => {
    it("should create avatar config", async () => {
      const configId = await avatarService.upsertAvatarConfig(testActorId, {
        selectionRule: "emotion_first",
        weights: {
          emotion: 0.4,
          mood: 0.3,
          action: 0.2,
          location: 0.1,
          time: 0.05,
          outfit: 0.05,
        },
        fallbackChain: ["emotion", "mood", "action",],
      },);
      expect(configId,).toBeDefined();
    });

    it("should get avatar config", async () => {
      const config = await avatarService.getAvatarConfig(testActorId,);
      expect(config,).toBeDefined();
      expect(config?.selectionRule,).toBe("emotion_first",);
    });

    it("should update avatar config", async () => {
      await avatarService.upsertAvatarConfig(testActorId, {
        selectionRule: "mood_first",
      },);
      const config = await avatarService.getAvatarConfig(testActorId,);
      expect(config?.selectionRule,).toBe("mood_first",);
    });
  });
});
