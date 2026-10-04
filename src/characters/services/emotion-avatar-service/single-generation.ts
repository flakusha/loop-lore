// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/services/emotion-avatar-service/single-generation.ts
// Single-variant emotion avatar generation (moved out of generation.ts so the
// batch orchestrator and the one-avatar path can be read independently).

import { randomUUID, } from "node:crypto";
import type { Kysely, } from "kysely";
import { persistGeneratedImages, } from "../../../assets/service";
import { AssetAlphaStatus, EMOTION_ORDINAL, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { generateImages, } from "../../../generation/image-engine";
import { enqueueAutoMatting, } from "../../../generation/matting/auto-matte";
import { getLogger, } from "../../../logger";
import { buildEmotionPrompt, extractAvatarMetadata, } from "../emotion-avatar-fallback";
import type { GenerateEmotionAvatarOpts, GenerationDispatchHandle, } from "./generation";

/**
 * Resolve the user that must own an asset generated for an actor.
 *
 * `assets.owner_id` references `users.id`, so the actor id is never a valid
 * owner: it trips the FK when no user holds that id, and silently hands the
 * asset to an unrelated user when one does. The owner is the actor row's
 * `owner_id` (owned characters) or `user_id` (the requester's own persona) —
 * the same pair `resolveActorAccess` (src/routes/actor-access.ts) treats as
 * ownership — so the asset owner and the `link.entityId` actor stay one
 * principal.
 * @param db
 * @param actorId
 * @returns The owning user id
 * @throws {Error} When the actor row is missing or has no owning user
 */
export async function resolveAssetOwnerId(db: Kysely<DB>, actorId: string): Promise<string> {
  const actor = await db
    .selectFrom("actors")
    .select(["owner_id", "user_id"])
    .where("id", "=", actorId)
    .executeTakeFirst();

  const userId = actor?.owner_id ?? actor?.user_id ?? null;

  if (!userId) {
    throw new Error(`Actor ${actorId} has no owning user to own generated assets`);
  }

  return userId;
}

/**
 * Generate a single emotion avatar variant.
 * @param svc
 * @param opts
 * @param opts.actorId
 * @param opts.emotion
 * @param opts.sdConfig
 * @param opts.uploadDir
 * @param opts.promptPrefix
 * @param opts.negativePrompt
 * @param opts.baseAvatarId
 * @param opts.fallbackMode
 * @param opts.avatarEmotions
 * @returns void
 * @throws {Error}
 */
export async function generateEmotionAvatar(
  svc: GenerationDispatchHandle,
  opts: GenerateEmotionAvatarOpts,
): Promise<{ avatarId: string; assetId: string }> {
  const emotionModifier = svc.resolveEmotionPromptModifier(opts.emotion, opts.avatarEmotions,);

  // Outfit descriptor slot: prompt = identity-anchor + outfit-descriptor
  // + emotion-descriptor (wardrobe ticket's composition contract).
  let outfitDescriptor = "";
  if (opts.outfitId) {
    const item = await svc.db
      .selectFrom("wardrobe_items",)
      .select(["descriptor",],)
      .where("id", "=", opts.outfitId,)
      .executeTakeFirst();

    outfitDescriptor = item?.descriptor ?? "";
  }

  const outfitSlot = outfitDescriptor ? `${outfitDescriptor}, ` : "";

  // Build prompt: use explicit prefix if provided, otherwise use metadata fallback
  let prompt: string;
  let usedFallback = false;

  if (opts.promptPrefix) {
    prompt = `${opts.promptPrefix}, ${outfitSlot}${emotionModifier}`;
  } else if (opts.baseAvatarId && opts.fallbackMode !== "none") {
    // Extract metadata from base avatar for fallback prompt construction.
    // Pass `actorId` so the character description anchors the prompt when
    // the asset row has no alt text.
    const metadata = await extractAvatarMetadata(svc.db, opts.baseAvatarId, {
      actorId: opts.actorId,
    },);

    // Identity anchor first, then the outfit descriptor slot, then the
    // emotion descriptor (buildEmotionPrompt appends emotion + quality).
    const anchor = metadata.caption ?? metadata.altText ?? "character portrait";
    const anchorWithOutfit = outfitDescriptor ? `${anchor}, ${outfitDescriptor}` : anchor;
    prompt = buildEmotionPrompt({ ...metadata, caption: anchorWithOutfit, }, opts.emotion, emotionModifier,);
    usedFallback = true;
  } else {
    prompt = `character portrait, ${outfitSlot}${emotionModifier}, detailed face, high quality`;
  }

  if (usedFallback) {
    getLogger().info("Using metadata fallback for emotion avatar prompt", {
      emotion: opts.emotion,
      baseAvatarId: opts.baseAvatarId,
      promptLength: prompt.length,
    },);
  }

  const outcome = await generateImages(opts.sdConfig, { prompt, n: 1, outputFormat: "png", },);

  if (!outcome.ok) {
    throw new Error(outcome.error,);
  }

  const { images, mimeType, } = outcome;

  // The asset is owned by the actor's user, not by the actor id; the link
  // below stays keyed on the actor.
  const assetOwnerId = await resolveAssetOwnerId(svc.db, opts.actorId);

  // Persist generated buffers via the shared generation→asset contract, then
  // create avatars on top. Avatar rows + matting stay caller-owned follow-ups.
  const persisted = await persistGeneratedImages({
    database: svc.db,
    uploadDir: opts.uploadDir,
    images,
    mimeType,
    ownerId: assetOwnerId,
    altText: `Emotion avatar: ${opts.emotion}`,
    link: {
      entityType: "actor",
      entityId: opts.actorId,
      label: `emotion:${opts.emotion}`,
    },
    makeFilename: () => `emotion-${opts.emotion}-${randomUUID().slice(0, 8,)}.png`,
  },);

  let avatarId = "";
  let assetId = "";

  for (const { asset, } of persisted) {
    assetId = asset.id;

    // Create avatar with emotion tag (+ outfit scope when in play)
    avatarId = await svc.avatarService.createAvatar({
      actorId: opts.actorId,
      assetId: asset.id,
      label: `${opts.emotion} expression`,
      tags: { emotion: opts.emotion, },
      isPrimary: false,
      sortOrder: EMOTION_ORDINAL[opts.emotion],
      outfitId: opts.outfitId,
    },);

    // Auto-enqueue matting for generated sprites. Providers typically emit
    // RGBA PNGs with fully opaque pixels, so header-level detection marks the
    // asset `native` and would skip matting — force the raw path here.
    // TODO(matting): once providers gain true-alpha output or store-time
    // pixel sampling lands, drop this override and trust `asset.alpha_status`.
    await enqueueAutoMatting({
      database: svc.db,
      uploadDir: opts.uploadDir,
      assetId: asset.id,
      alphaStatus: opts.mattingProvider ? AssetAlphaStatus.Raw : asset.alpha_status,
      ownerId: assetOwnerId,
      provider: opts.mattingProvider,
    },);
  }

  return { avatarId, assetId, };
}
