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
          size_bytes: 1024,
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
      expect(avatarId.length,).toBeGreaterThan(0,);
    });
  });

  describe("getAvatars", () => {
    it("should get all avatars for an actor", async () => {
      const avatars = await avatarService.getAvatars(testActorId,);
      expect(avatars.length,).toBeGreaterThan(0,);
      expect(avatars[0]?.actorId,).toBe(testActorId,);
    });
  });

  describe("getAvatar", () => {
    it("should get a specific avatar by ID", async () => {
      const avatars = await avatarService.getAvatars(testActorId,);
      const avatarId = avatars[0]?.id;
      if (!avatarId) { throw new Error("No avatar found",); }

      const avatar = await avatarService.getAvatar(avatarId,);
      expect(avatar,).toBeDefined();
      expect(avatar?.id,).toBe(avatarId,);
    });

    it("should return undefined for non-existent avatar", async () => {
      const avatar = await avatarService.getAvatar("non-existent-id",);
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
      expect(avatar,).not.toBeNull();
      expect(avatar?.tags.emotion,).toBe("happy",);
    });

    it("should fall back via chain when no weighted match", async () => {
      // With the updated chain semantics, when no avatar's tag values
      // match the request context (emotion: angry) AND no avatar_config
      // override is configured, the default chain
      // `["emotion","mood","action","location","time","outfit"]` walks
      // for an avatar that *has* a value for each tag type. Both
      // existing avatars have `emotion` tags, so the chain returns the
      // first avatar (sorted by sort_order ASC) that has an emotion tag.
      // Sad expression has sort_order=1 and is present in the actor's
      // avatar list at the time this assertion runs.
      const avatar = await avatarService.selectAvatar(testActorId, {
        emotion: "angry",
      },);
      expect(avatar,).not.toBeNull();
      // The chain returns the first avatar in sort_order ASC order that
      // carries the chain tag's value. Pre-existing tests mutated the
      // primary avatar's sort_order to 5, so Sad (sort_order=1) wins.
      expect(avatar?.tags.emotion,).toBe("sad",);
    });
  });

  describe("selectAvatar empty-list fallback (BUG-avatar-select-empty-throws)", () => {
    let actorWithBaseId: string;
    let actorWithoutBaseId: string;
    const baseAssetId = "empty-fallback-base-asset";

    beforeAll(async () => {
      const { actorId: a1, } = await createTestActors(db, "empty-fallback-with-base",);
      actorWithBaseId = a1;
      const { actorId: a2, } = await createTestActors(db, "empty-fallback-no-base",);
      actorWithoutBaseId = a2;
      await db
        .insertInto("assets",)
        .values({
          id: baseAssetId,
          owner_id: "test-user",
          filename: "base.png",
          mime_type: "image/png",
          asset_type: "image",
          size_bytes: 1024,
          storage_path: "/test/base.png",
          storage_backend: "local",
          visibility: "private",
        },)
        .execute();
      await db
        .updateTable("actors",)
        .set({ avatar_asset_id: baseAssetId, },)
        .where("id", "=", actorWithBaseId,)
        .execute();
    },);

    it("returns synthesized base avatar when actor has zero emotion avatars", async () => {
      const avatar = await avatarService.selectAvatar(actorWithBaseId, { emotion: "happy", },);
      expect(avatar,).not.toBeNull();
      expect(avatar?.assetId,).toBe(baseAssetId,);
      expect(avatar?.isPrimary,).toBe(true,);
      expect(avatar?.label,).toBe("base portrait",);
    });

    it("returns null when actor has no avatars AND no base portrait", async () => {
      const avatar = await avatarService.selectAvatar(actorWithoutBaseId, { emotion: "happy", },);
      expect(avatar,).toBeNull();
    });
  });

  describe("selectAvatar fallback_chain (BUG-avatar-select-fallback-chain-unwired)", () => {
    let chainActorId: string;

    beforeAll(async () => {
      const { actorId, } = await createTestActors(db, "chain-test-actor",);
      chainActorId = actorId;
      // Two avatars with distinct tag types — the chain ordering decides
      // which one wins when the primary score is zero.
      await avatarService.createAvatar({
        actorId: chainActorId,
        assetId: testAssetId1,
        label: "Happy face",
        tags: { emotion: "happy", },
        isPrimary: true,
        sortOrder: 1,
      },);
      await avatarService.createAvatar({
        actorId: chainActorId,
        assetId: testAssetId2,
        label: "Attack pose",
        tags: { action: "attack", },
        isPrimary: false,
        sortOrder: 2,
      },);
      // Chain order: action before emotion. With a context that matches
      // neither avatar's tag values, primaryScore < 1 and the chain walk
      // picks the first avatar tagged with `action` (Attack pose).
      // Reversing the chain would flip the result.
      await avatarService.upsertAvatarConfig(chainActorId, {
        selectionRule: "weighted",
        fallbackChain: ["action", "emotion",],
      },);
    },);

    it("consults fallback_chain in configured order when primary yields no match", async () => {
      const avatar = await avatarService.selectAvatar(chainActorId, {
        mood: "brooding",
        location: "forest",
      },);
      expect(avatar,).not.toBeNull();
      expect(avatar?.label,).toBe("Attack pose",);
    });
  });

  describe("deleteAvatar", () => {
    it("should delete an avatar", async () => {
      const avatars = await avatarService.getAvatars(testActorId,);
      const avatarId = avatars[avatars.length - 1]?.id;
      if (!avatarId) { throw new Error("No avatar found",); }

      const avatar = await avatarService.getAvatar(avatarId,);
      expect(avatar,).toBeDefined();
      const assetId = avatar!.assetId;

      await avatarService.deleteAvatar(avatarId,);

      const deleted = await avatarService.getAvatar(avatarId,);
      expect(deleted,).toBeUndefined();

      // asset itself remains intact (AC-5)
      const asset = await db
        .selectFrom("assets",)
        .selectAll()
        .where("id", "=", assetId,)
        .executeTakeFirst();
      expect(asset,).toBeDefined();
      expect(asset?.id,).toBe(assetId,);
    });
  });

  describe("Avatar Config", () => {
    it("should create avatar config", async () => {
      const { actorId, } = await createTestActors(db, "config-actor-001",);
      const configId = await avatarService.upsertAvatarConfig(actorId, {
        selectionRule: "weighted",
        weights: { emotion: 0.5, mood: 0.3, action: 0.2, },
      },);

      expect(configId,).toBeDefined();
      expect(configId.length,).toBeGreaterThan(0,);
      const read = await avatarService.getAvatarConfig(actorId,);
      expect(read?.selectionRule,).toBe("weighted",);
      expect(read?.weights.emotion,).toBe(0.5,);
    });

    it("should get avatar config", async () => {
      const { actorId, } = await createTestActors(db, "config-actor-002",);
      await avatarService.upsertAvatarConfig(actorId, {
        selectionRule: "mood_first",
      },);

      const config = await avatarService.getAvatarConfig(actorId,);
      expect(config,).toBeDefined();
      expect(config?.selectionRule,).toBe("mood_first",);
    });

    it("should update avatar config", async () => {
      const { actorId, } = await createTestActors(db, "config-actor-003",);
      await avatarService.upsertAvatarConfig(actorId, {
        selectionRule: "emotion_first",
      },);
      await avatarService.upsertAvatarConfig(actorId, {
        selectionRule: "action_first",
      },);

      const config = await avatarService.getAvatarConfig(actorId,);
      expect(config?.selectionRule,).toBe("action_first",);
    });
  });
});
