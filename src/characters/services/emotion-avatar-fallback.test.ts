/**
 * Tests for emotion avatar fallback utilities.
 *
 * @module characters/services/emotion-avatar-fallback.test
 */

import { beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import { createAsset, } from "../../assets/service";
import { makeMinimalPng, } from "../../assets/test-helpers";
import { EmotionType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { type AvatarMetadata, buildEmotionPrompt, extractAvatarMetadata, } from "./emotion-avatar-fallback";
import { createTestActors, } from "./test-helpers";

describe("buildEmotionPrompt", () => {
  it("builds prompt from caption metadata", () => {
    const metadata: AvatarMetadata = {
      caption: "portrait of a young woman with red hair",
    };
    const result = buildEmotionPrompt(
      metadata,
      EmotionType.Happy,
      "happy expression, smiling, bright eyes, cheerful",
    );
    expect(result,).toBe(
      "portrait of a young woman with red hair, happy expression, smiling, bright eyes, cheerful, high quality, detailed, sharp focus, professional",
    );
  });

  it("builds prompt from alt text when no caption", () => {
    const metadata: AvatarMetadata = {
      altText: "Aria, the elven mage",
    };
    const result = buildEmotionPrompt(
      metadata,
      EmotionType.Sad,
      "sad expression, downcast eyes, melancholy, sorrowful",
    );
    expect(result,).toBe(
      "Aria, the elven mage, sad expression, downcast eyes, melancholy, sorrowful, high quality, detailed, sharp focus, professional",
    );
  });

  it("uses generic portrait when no metadata", () => {
    const metadata: AvatarMetadata = {};
    const result = buildEmotionPrompt(
      metadata,
      EmotionType.Angry,
      "angry expression, furrowed brow, intense gaze, furious",
    );
    expect(result,).toBe(
      "character portrait, angry expression, furrowed brow, intense gaze, furious, high quality, detailed, sharp focus, professional",
    );
  });

  it("uses custom quality tags when provided", () => {
    const metadata: AvatarMetadata = {
      caption: "anime girl with blue eyes",
    };
    const result = buildEmotionPrompt(
      metadata,
      EmotionType.Excited,
      "excited expression, enthusiastic, eager, thrilled",
      "masterpiece, best quality, 4k",
    );
    expect(result,).toBe(
      "anime girl with blue eyes, excited expression, enthusiastic, eager, thrilled, masterpiece, best quality, 4k",
    );
  });

  it("prefers caption over alt text", () => {
    const metadata: AvatarMetadata = {
      caption: "from caption",
      altText: "from alt text",
    };
    const result = buildEmotionPrompt(
      metadata,
      EmotionType.Neutral,
      "neutral expression, calm face, natural look",
    );
    expect(result,).toContain("from caption",);
    expect(result,).not.toContain("from alt text",);
  });
});

describe("extractAvatarMetadata", () => {
  let db: Kysely<DB>;
  let testUserId: string;

  beforeAll(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    const { userId, } = await createTestActors(db,);
    testUserId = userId;
  },);

  it("returns empty metadata for non-existent asset", async () => {
    const result = await extractAvatarMetadata(db, "non-existent-id",);
    expect(result,).toEqual({},);
  });

  it("extracts alt text from asset record", async () => {
    // Create a test asset with alt text
    const buffer = makeMinimalPng(512, 512,);
    const asset = await createAsset({
      database: db,
      input: {
        ownerId: testUserId,
        filename: "test-avatar.png",
        mimeType: "image/png",
        assetType: "image",
        sizeBytes: buffer.length,
        buffer,
        altText: "Aria, the elven mage",
      },
      uploadDir: "/tmp/test-uploads",
    },);

    const result = await extractAvatarMetadata(db, asset.id,);
    expect(result.altText,).toBe("Aria, the elven mage",);
    expect(result.caption,).toBe("Aria, the elven mage",);
    expect(result.width,).toBe(512,);
    expect(result.height,).toBe(512,);
  });
});
