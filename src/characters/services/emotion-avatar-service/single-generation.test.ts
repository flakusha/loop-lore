// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Behavior tests for single-variant emotion avatar generation.
 *
 * The image provider is stubbed at the module boundary so what is asserted
 * here is the composition contract of the wardrobe branch, not the SD call:
 *
 *  - prompt slot order is identity anchor → outfit descriptor → emotion
 *    modifier, and the outfit descriptor is read from `wardrobe_items`.
 *  - an explicit promptPrefix bypasses the metadata fallback entirely.
 *  - a generation failure propagates the provider error rather than writing
 *    a partial avatar.
 *  - the persisted asset gets an avatar row tagged with the emotion and
 *    scoped to the outfit.
 *
 * ISOLATED-only: mock.module is process-global and leaks across files without
 * --isolate, so plain `bun test src/` skips this file.
 */
import { beforeAll, expect, it, mock, } from "bun:test";
import type { Kysely, } from "kysely";
import { EmotionType, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { createTestDb, } from "../../../test-utils/create-test-db";
import {
  insertActors,
  insertUsers,
  insertWardrobeItems,
} from "../../../test-utils/insert-helpers";
import { describeOrSkip, ISOLATED, } from "../../../test-utils/isolate-only";
import type { AvatarService, } from "../avatar-service";
import type { GenerationDispatchHandle, } from "./generation";

/** Captured generateImages calls, so prompts can be asserted. */
const calls: Array<{ prompt: string }> = [];
/** Flipped by a test to make the provider report a failure. */
let providerShouldFail = false;

let generateEmotionAvatar: typeof import("./single-generation").generateEmotionAvatar;

if (ISOLATED) {
  mock.module("../../../generation/image-engine", () => ({
    generateImages: async (_cfg: unknown, opts: { prompt: string },) => {
      calls.push({ prompt: opts.prompt, },);
      if (providerShouldFail) {
        return { ok: false, error: "provider exploded", status: 502, };
      }

      return {
        ok: true,
        images: [Buffer.from("fake-png", "utf8",),],
        mimeType: "image/png",
      };
    },
  }),);

  mock.module("../../../generation/matting/auto-matte", () => ({
    enqueueAutoMatting: async () => undefined,
  }),);

  ({ generateEmotionAvatar, } = await import("./single-generation"));
}

const SD_CONFIG = { name: "test-sd", label: "Test", baseUrl: "http://127.0.0.1:7860", } as never;
/** Actor id deliberately also present in `users` (id-collision case). */
const COLLIDING_ACTOR_ID = "actor-id-collision";

describeOrSkip("generateEmotionAvatar", () => {
  let db: Kysely<DB>;
  const actorId = "actor-single-gen";
  const ownerUserId = "user-single-gen";
  const outfitId = "outfit-single-gen";
  const createdAvatars: Array<{ label: string; tags: unknown; outfitId?: string; assetId: string }> = [];

  /**
   * @returns a dispatch handle whose avatar service records what it was asked to create
   */
  function makeSvc(): GenerationDispatchHandle {
    const avatarService = {
      createAvatar: async (opts: Record<string, unknown>,) => {
        createdAvatars.push({
          label: opts.label as string,
          tags: opts.tags,
          outfitId: opts.outfitId as string | undefined,
          assetId: opts.assetId as string,
        },);

        return `avatar-${createdAvatars.length}`;
      },
    } as unknown as AvatarService;

    return {
      db,
      avatarService,
      resolveEmotionPromptModifier: (emotion: string,) => `mod(${emotion})`,
      generateEmotionAvatar,
    } as unknown as GenerationDispatchHandle;
  }

  beforeAll(async () => {
    const created = await createTestDb();
    db = created.db;
    // assets.owner_id references users.id and is derived from the actor row,
    // so the actor gets a real owning user whose id is NOT the actor id.
    await insertUsers(db, "single-gen", "Single Gen", { id: ownerUserId as never, },);
    await insertActors(db, "Single Gen Actor", { id: actorId, owner_id: ownerUserId, },);
    await insertWardrobeItems(db, "Descriptor Outfit", {
      id: outfitId,
      actor_id: actorId,
      descriptor: "flowing crimson silk",
    },);
  },);

  it("injects the outfit descriptor between the prompt prefix and the emotion modifier", async () => {
    calls.length = 0;
    await generateEmotionAvatar(makeSvc(), {
      actorId,
      emotion: EmotionType.Happy,
      sdConfig: SD_CONFIG,
      uploadDir: "/tmp",
      promptPrefix: "a lone traveler",
      outfitId,
    },);

    expect(calls,).toHaveLength(1,);
    // identity anchor, then outfit descriptor, then emotion modifier.
    expect(calls[0]?.prompt,).toBe(
      `a lone traveler, flowing crimson silk, mod(${EmotionType.Happy})`,
    );
  });

  it("omits the outfit slot entirely when no outfit is in play", async () => {
    calls.length = 0;
    await generateEmotionAvatar(makeSvc(), {
      actorId,
      emotion: EmotionType.Sad,
      sdConfig: SD_CONFIG,
      uploadDir: "/tmp",
      promptPrefix: "a lone traveler",
    },);

    expect(calls[0]?.prompt,).toBe(`a lone traveler, mod(${EmotionType.Sad})`,);
  });

  it("falls back to the generic template with no prefix and no base avatar", async () => {
    calls.length = 0;
    await generateEmotionAvatar(makeSvc(), {
      actorId,
      emotion: EmotionType.Angry,
      sdConfig: SD_CONFIG,
      uploadDir: "/tmp",
      outfitId,
    },);

    expect(calls[0]?.prompt,).toBe(
      `character portrait, flowing crimson silk, mod(${EmotionType.Angry}), detailed face, high quality`,
    );
  });

  it("tolerates an outfitId that no longer resolves to a row", async () => {
    calls.length = 0;
    await generateEmotionAvatar(makeSvc(), {
      actorId,
      emotion: EmotionType.Happy,
      sdConfig: SD_CONFIG,
      uploadDir: "/tmp",
      promptPrefix: "an anchor",
      outfitId: "outfit-that-was-deleted",
    },);

    // Descriptor lookup missed, so the slot collapses to nothing.
    expect(calls[0]?.prompt,).toBe(`an anchor, mod(${EmotionType.Happy})`,);
  });

  it("throws the provider error and creates no avatar when generation fails", async () => {
    createdAvatars.length = 0;
    providerShouldFail = true;
    try {
      await expect(
        generateEmotionAvatar(makeSvc(), {
          actorId,
          emotion: EmotionType.Happy,
          sdConfig: SD_CONFIG,
          uploadDir: "/tmp",
          promptPrefix: "an anchor",
        },),
      ).rejects.toThrow("provider exploded",);
    } finally {
      providerShouldFail = false;
    }

    expect(createdAvatars,).toHaveLength(0,);
  });

  it("creates the avatar tagged with the emotion and scoped to the outfit", async () => {
    createdAvatars.length = 0;
    const result = await generateEmotionAvatar(makeSvc(), {
      actorId,
      emotion: EmotionType.Happy,
      sdConfig: SD_CONFIG,
      uploadDir: "/tmp",
      promptPrefix: "an anchor",
      outfitId,
    },);

    expect(result.avatarId,).toBe("avatar-1",);
    expect(result.assetId,).toBeTruthy();
    expect(createdAvatars,).toHaveLength(1,);
    expect(createdAvatars[0]?.tags,).toEqual({ emotion: EmotionType.Happy, },);
    expect(createdAvatars[0]?.outfitId,).toBe(outfitId,);
    expect(createdAvatars[0]?.label,).toContain(EmotionType.Happy,);
    expect(createdAvatars[0]?.assetId,).toBe(result.assetId,);
  });

  it("owns the generated asset with the actor's user id, not the actor id", async () => {
    const result = await generateEmotionAvatar(makeSvc(), {
      actorId,
      emotion: EmotionType.Happy,
      sdConfig: SD_CONFIG,
      uploadDir: "/tmp",
      promptPrefix: "an anchor",
      outfitId,
    },);

    const asset = await db.selectFrom("assets",).selectAll().where("id", "=", result.assetId,).executeTakeFirst();
    expect(asset?.owner_id,).toBe(ownerUserId,);
    expect(asset?.owner_id,).not.toBe(actorId,);

    // The link stays keyed on the actor, so owner_id and link.entity_id stay
    // one principal (the gallery joins asset_links -> actors.owner_id).
    const link = await db.selectFrom("asset_links",).selectAll().where("asset_id", "=", result.assetId,).executeTakeFirst();
    expect(link?.entity_type,).toBe("actor",);
    expect(link?.entity_id,).toBe(actorId,);
  },);

  it("never hands the asset to an unrelated user whose id collides with the actor id", async () => {
    // A user holding the actor id satisfies the FK, so this is the silent
    // mis-attribution case: the asset would land on the wrong principal.
    await insertUsers(db, "id-collision", "Id Collision", { id: COLLIDING_ACTOR_ID as never, },);
    const collidingActor = await insertActors(db, "Colliding Actor", {
      id: COLLIDING_ACTOR_ID,
      owner_id: ownerUserId,
    },);

    const result = await generateEmotionAvatar(makeSvc(), {
      actorId: collidingActor,
      emotion: EmotionType.Happy,
      sdConfig: SD_CONFIG,
      uploadDir: "/tmp",
      promptPrefix: "an anchor",
    },);

    const asset = await db.selectFrom("assets",).selectAll().where("id", "=", result.assetId,).executeTakeFirst();
    expect(asset?.owner_id,).toBe(ownerUserId,);
  },);

  it("refuses to generate for an actor with no owning user", async () => {
    const orphanActor = await insertActors(db, "Orphan Actor", { id: "actor-no-owning-user", },);

    await expect(
      generateEmotionAvatar(makeSvc(), {
        actorId: orphanActor,
        emotion: EmotionType.Happy,
        sdConfig: SD_CONFIG,
        uploadDir: "/tmp",
        promptPrefix: "an anchor",
      },),
    ).rejects.toThrow("no owning user",);
  },);
},);
