// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Emotion Avatars Routes
 *
 * API endpoints for emotion avatar batch generation and management.
 * Exposes the EmotionAvatarService for character-specific emotion variants.
 */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { EmotionAvatarService, } from "../characters/services/emotion-avatar-service";
import { EmotionType, } from "../db/enums";
import type { DB, } from "../db/schema";
import { checkActorOwnership, } from "./actor-auth";
import {
  emotionJobNotFoundResponse,
  HttpStatus,
  jsonCreated,
  jsonError,
  jsonResponse,
  requireUserId,
} from "./http-utils";

interface HandlerOpts {
  database: Kysely<DB>;
}

/**
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { actors: { ":actorId": { ...; }; }; }; } & ... 4 more ... & { ...; }, { ...; }, { ...; }>}
 */
export function characterEmotionAvatarsRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  const emotionAvatarService = new EmotionAvatarService(database,);

  return new Elysia({ name: "character-emotion-avatars", },)
    // ── List batch generation jobs ────────────────────────────────
    .get(`${prefix}/actors/:actorId/emotion-avatars/jobs`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const actorId = ctx.params.actorId as string;
      if (!await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,)) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      const jobs = emotionAvatarService.listJobs(actorId,);
      return jsonResponse(jobs,);
    },)
    // ── Get specific job status ───────────────────────────────────
    .get(`${prefix}/actors/:actorId/emotion-avatars/jobs/:jobId`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const actorId = ctx.params.actorId as string;
      if (!await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,)) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      const { jobId, } = ctx.params as { jobId: string };
      const job = emotionAvatarService.getJobStatus(jobId as any,);
      // checkActorOwnership only proves the caller owns the actor in the PATH.
      // The job carries its own actor, so owning any single actor would let a
      // caller read another tenant's job (IDOR).
      if (!job || job.actorId !== actorId) {
        return emotionJobNotFoundResponse(ctx.t,);
      }

      return jsonResponse(job,);
    },)
    // ── Cancel a running job ──────────────────────────────────────
    .post(`${prefix}/actors/:actorId/emotion-avatars/jobs/:jobId/cancel`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const actorId = ctx.params.actorId as string;
      if (!await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,)) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      const { jobId, } = ctx.params as { jobId: string };
      // ORDER IS LOAD-BEARING: cancelJob returns only a boolean and
      // irreversibly destroys the job, so a foreign caller must be rejected
      // before it is invoked.
      const job = emotionAvatarService.getJobStatus(jobId as any,);
      if (!job || job.actorId !== actorId) {
        return emotionJobNotFoundResponse(ctx.t,);
      }

      const cancelled = emotionAvatarService.cancelJob(jobId as any,);
      if (!cancelled) {
        return jsonError({
          message: ctx.t?.("characters.emotionJobAlreadyCompleted",) ?? "Job not found or already completed",
          status: HttpStatus.NotFound,
        },);
      }

      return jsonResponse({ ok: true, cancelled: true, },);
    },)
    // ── Start batch generation ───────────────────────────────────
    .post(`${prefix}/actors/:actorId/emotion-avatars`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const actorId = ctx.params.actorId as string;
      if (!await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,)) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      const body = ctx.body as Record<string, unknown>;

      const baseAvatarId = body.baseAvatarId as string | undefined;
      const emotionsParam = body.emotions as string[] | undefined;
      const promptPrefix = body.promptPrefix as string | undefined;
      const negativePrompt = body.negativePrompt as string | undefined;

      if (!baseAvatarId) {
        return jsonError({ message: "baseAvatarId is required", status: HttpStatus.BadRequest, },);
      }

      // Validate emotions if provided
      if (emotionsParam && emotionsParam.length > 0) {
        const validEmotions = Object.values(EmotionType,) as string[];
        // BUG-emotion-avatar-emotions-array-uncapped-x-default-rate-policy:
        // every entry fans out into its own image-gen job, so the array is
        // capped at one entry per emotion and duplicates are rejected —
        // uncapped, a single request could enqueue unbounded generation work.
        if (emotionsParam.length > validEmotions.length) {
          return jsonError({
            message: `emotions accepts at most ${validEmotions.length} entries`,
            status: HttpStatus.BadRequest,
          },);
        }

        for (const e of emotionsParam) {
          if (!validEmotions.includes(e,)) {
            return jsonError({ message: `Invalid emotion: ${e}`, status: HttpStatus.BadRequest, },);
          }
        }

        const seenEmotions = new Set(emotionsParam,);
        if (seenEmotions.size !== emotionsParam.length) {
          return jsonError({ message: "emotions must not contain duplicates", status: HttpStatus.BadRequest, },);
        }
      }

      const emotions = emotionsParam ? emotionsParam as EmotionType[] : undefined;

      try {
        const jobId = await emotionAvatarService.startBatchGeneration({
          actorId,
          baseAvatarId,
          emotions,
          promptPrefix,
          negativePrompt,
        },);

        return jsonCreated({ jobId, },);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to start generation";
        return jsonError({ message, status: HttpStatus.BadRequest, },);
      }
    },)
    // ── Get emotion prompt modifier ──────────────────────────────
    .get(`${prefix}/emotions/prompt-modifier/:emotion`, (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      const { emotion, } = ctx.params as { emotion: string };
      const validEmotions = Object.values(EmotionType,) as string[];
      if (!validEmotions.includes(emotion,)) {
        return jsonError({ message: `Invalid emotion: ${emotion}`, status: HttpStatus.BadRequest, },);
      }

      const modifier = emotionAvatarService.getEmotionPromptModifier(emotion as EmotionType,);
      return jsonResponse({ emotion, modifier, },);
    },)
    // ── List available emotion types ───────────────────────────
    .get(`${prefix}/emotions/types`, (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      const emotions = Array.from(Object.values(EmotionType,), (emotion,) => ({
        value: emotion,
        displayName: emotion.charAt(0,).toUpperCase() + emotion.slice(1,),
      }),);

      return jsonResponse(emotions,);
    },);
}
