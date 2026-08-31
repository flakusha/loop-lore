// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import {
  ActorEmotionParams,
  ActorIdParams,
  CharacterEmotionBody,
  ErrorResponse,
  ListResponse,
  SuccessResponse,
} from "../../validation/schemas";
import { checkActorOwnership, } from "../actor-auth";
import { HttpStatus, jsonCreated, jsonError, jsonResponse, requireUserId, } from "../http-utils";
import type { HandlerOpts, } from "./types";

const OptionalString = t.Optional(t.String(),);

const ActorEmotionsListResponse = ListResponse(t.Object({
  id: t.String(),
  actorId: t.String(),
  emotionId: t.String(),
  intensity: t.Number(),
  context: OptionalString,
  expiresAt: OptionalString,
},),);

const ActorEmotionResponse = t.Object({
  id: t.String(),
  actorId: t.String(),
  emotionId: t.String(),
  intensity: t.Number(),
  context: OptionalString,
  expiresAt: OptionalString,
},);

/**
 * Actor emotions sub-plugin — CRUD for an actor's active emotions.
 * @param opts
 * @param prefix
 */
export function actorRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "character-emotions-actor", },)
      // ── List emotions for an actor ─────────────────────────────
      .get(`${prefix}/actors/:actorId/emotions`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const { actorId, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
        }

        const emotions = await database
          .selectFrom("character_emotions",)
          .selectAll()
          .where("actor_id", "=", actorId,)
          .execute();

        return jsonResponse(emotions,);
      }, {
        params: ActorIdParams,
        response: {
          200: ActorEmotionsListResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "List actor emotions",
          description: "List all emotions currently active for an actor.",
          tags: ["Character Emotions",],
        },
      },)
      // ── Get a specific emotion ─────────────────────────────────
      .get(`${prefix}/actors/:actorId/emotions/:emotionId`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const { actorId, emotionId, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
        }

        const emotion = await database
          .selectFrom("character_emotions",)
          .selectAll()
          .where("id", "=", emotionId,)
          .executeTakeFirst();

        if (!emotion) {
          return jsonError({
            message: ctx.t?.("characters.emotionNotFound",) ?? "Emotion not found",
            status: HttpStatus.NotFound,
          },);
        }
        return jsonResponse(emotion,);
      }, {
        params: ActorEmotionParams,
        response: {
          200: ActorEmotionResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Get actor emotion",
          description: "Get a specific emotion by ID for an actor.",
          tags: ["Character Emotions",],
        },
      },)
      // ── Set/update an emotion for an actor ─────────────────────
      .post(`${prefix}/actors/:actorId/emotions`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const { actorId, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
        }

        const { emotionId, intensity, context, expiresAt, } = ctx.body;

        // Upsert: check if emotion already exists for this actor
        const existing = await database
          .selectFrom("character_emotions",)
          .selectAll()
          .where("actor_id", "=", actorId,)
          .where("emotion_id", "=", emotionId,)
          .executeTakeFirst();

        if (existing) {
          await database
            .updateTable("character_emotions",)
            .set({
              intensity: intensity ?? existing.intensity,
              context: context ?? existing.context,
              expires_at: expiresAt ?? existing.expires_at,
              updated_at: new Date().toISOString(),
            },)
            .where("id", "=", existing.id,)
            .execute();
          return jsonResponse({ id: existing.id, updated: true, },);
        }

        const id = crypto.randomUUID();
        await database
          .insertInto("character_emotions",)
          .values({
            id,
            actor_id: actorId,
            emotion_id: emotionId,
            intensity: intensity ?? 0.5,
            context: context ?? null,
            expires_at: expiresAt ?? null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },)
          .execute();

        return jsonCreated({ id, },);
      }, {
        params: ActorIdParams,
        body: CharacterEmotionBody,
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Set actor emotion",
          description: "Set or update an emotion for an actor. Upserts by emotion ID.",
          tags: ["Character Emotions",],
        },
      },)
      // ── Delete an emotion ──────────────────────────────────────
      .delete(`${prefix}/actors/:actorId/emotions/:emotionId`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const { actorId, emotionId, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
        }

        await database
          .deleteFrom("character_emotions",)
          .where("id", "=", emotionId,)
          .execute();

        return jsonResponse({ ok: true, },);
      }, {
        params: ActorEmotionParams,
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Delete actor emotion",
          description: "Remove an emotion from an actor.",
          tags: ["Character Emotions",],
        },
      },)
  );
}
