// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Outfit-scoped avatar routes: batch/single generation for one outfit,
 * plus context-aware (outfit, emotion) resolution — selection v2.
 *
 * Authz: actor ownership on every route (404 for non-owners). The outfit
 * must be visible to the actor (personal item or world template).
 */
import { Elysia, t, } from "elysia";
import { AvatarService, } from "../characters/services/avatar-service";
import { EmotionAvatarService, } from "../characters/services/emotion-avatar-service";
import { getWardrobeItem, } from "../characters/services/wardrobe/crud";
import { resolveOutfit, } from "../characters/services/wardrobe/resolve";
import { EmotionType, } from "../db/enums";
import {
  ErrorResponse,
  OutfitGenerateBody,
  OutfitGenerateSingleBody,
  OutfitResolveBody,
  WardrobeActorParams,
  WardrobeItemParams,
} from "../validation/schemas";
import { requireActorAccess, } from "./actor-auth";
import { HttpStatus, jsonCreated, jsonError, jsonResponse, } from "./http-utils";
import type { HandlerOpts } from "./actor-auth";

/**
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { actors: { ":actorId": { ...; }; }; }; } & ... 2 more ... & { ...; }, { ...; }, { ...; }>}
 */
export function wardrobeAvatarRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  const emotionAvatars = new EmotionAvatarService(database,);
  const avatars = new AvatarService(database,);

  return new Elysia({ name: "wardrobe-avatars", },)
    // ── Outfit-scoped batch generation ────────────────────────────

    .post(`${prefix}/actors/:actorId/wardrobe/:itemId/emotion-avatars`, async (ctx: any,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { actorId, itemId, } = ctx.params;
      const item = await getWardrobeItem(database, itemId, actorId,);
      if (!item) {
        return jsonError({ message: "Wardrobe item not found", status: HttpStatus.NotFound, },);
      }

      const { base_avatar_id: baseAvatarId, emotions, prompt_prefix, negative_prompt, replace, } = ctx.body;
      if (emotions) {
        const invalid = (emotions as string[]).find((e: string,) => !isEmotion(e,),);
        if (invalid) {
          return jsonError({ message: `Invalid emotion: ${invalid}`, status: HttpStatus.BadRequest, },);
        }
      }

      try {
        const jobId = await emotionAvatars.startBatchGeneration({
          actorId,
          baseAvatarId,
          emotions: emotions as EmotionType[] | undefined,
          promptPrefix: prompt_prefix,
          negativePrompt: negative_prompt,
          outfitId: itemId,
          replace,
        },);
        return jsonCreated({ jobId, },);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to start generation";
        return jsonError({ message, status: HttpStatus.BadRequest, },);
      }
    }, {
      params: WardrobeItemParams,
      body: OutfitGenerateBody,
      response: {
        201: t.Object({ jobId: t.String(), },),
        401: ErrorResponse,
        404: ErrorResponse,
        422: ErrorResponse,
      },
      detail: {
        summary: "Generate outfit emotion avatars",
        description:
          "Start outfit-scoped batch generation (emotion × outfit). With replace, re-rolls only this outfit's slots.",
        tags: ["Wardrobe",],
      },
    },)
    // ── Single-slot (emotion, outfit) generation ──────────────────

    .post(`${prefix}/actors/:actorId/wardrobe/:itemId/emotion-avatars/single`, async (ctx: any,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { actorId, itemId, } = ctx.params;
      const item = await getWardrobeItem(database, itemId, actorId,);
      if (!item) {
        return jsonError({ message: "Wardrobe item not found", status: HttpStatus.NotFound, },);
      }

      const { base_avatar_id: baseAvatarId, emotion, prompt_prefix, negative_prompt, replace, } = ctx.body;
      if (!isEmotion(emotion,)) {
        return jsonError({ message: `Invalid emotion: ${emotion}`, status: HttpStatus.BadRequest, },);
      }

      try {
        const jobId = await emotionAvatars.startBatchGeneration({
          actorId,
          baseAvatarId,
          emotions: [emotion as EmotionType,],
          promptPrefix: prompt_prefix,
          negativePrompt: negative_prompt,
          outfitId: itemId,
          // A single-slot call is a re-roll by default: it replaces only
          // THIS (emotion, outfit) slot — sibling slots/outfits untouched.
          replace: replace ?? true,
        },);
        return jsonCreated({ jobId, },);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to start generation";
        return jsonError({ message, status: HttpStatus.BadRequest, },);
      }
    }, {
      params: WardrobeItemParams,
      body: OutfitGenerateSingleBody,
      response: {
        201: t.Object({ jobId: t.String(), },),
        401: ErrorResponse,
        404: ErrorResponse,
        422: ErrorResponse,
      },
      detail: {
        summary: "Generate one outfit emotion avatar",
        description: "Re-roll a single (emotion, outfit) slot; other slots and outfits are untouched.",
        tags: ["Wardrobe",],
      },
    },)
    // ── Context resolution (outfit + avatar) ──────────────────────

    .post(`${prefix}/actors/:actorId/outfit-resolve`, async (ctx: any,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { actorId, } = ctx.params;
      const body = ctx.body;
      const outfit = await resolveOutfit(database, {
        actorId,
        chatId: body.chatId,
        worldId: body.worldId,
        locationId: body.locationId,
      },);
      const outfitId = body.outfitId !== undefined ? body.outfitId : outfit.outfitId;

      const avatar = await avatars.selectAvatar(actorId, {
        emotion: body.emotion,
        mood: body.mood,
        action: body.action,
        location: body.location,
        time: body.time,
        outfit: body.outfit,
        outfitId,
        chatId: body.chatId,
        locationId: body.locationId,
      }, body.worldId,);
      if (!avatar) {
        return jsonError({ message: "No avatar found", status: HttpStatus.NotFound, },);
      }
      return jsonResponse({
        outfit_id: outfitId,
        source: outfit.source,
        avatar,
      },);
    }, {
      params: WardrobeActorParams,
      body: OutfitResolveBody,
      response: {
        200: t.Any(),
        401: ErrorResponse,
        404: ErrorResponse,
        422: ErrorResponse,
      },
      detail: {
        summary: "Resolve outfit and avatar",
        description:
          "Resolve the context outfit (chat > location > default) and select the matching (outfit, emotion) avatar via the v2 ladder.",
        tags: ["Wardrobe",],
      },
    },);
}

/**
 * @param value
 * @returns {boolean} whether value is a known emotion type
 */
function isEmotion(value: string,): boolean {
  return (Object.values(EmotionType,) as string[]).includes(value,);
}
