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
  forbiddenResponse as forbidden,
  HttpStatus,
  jsonCreated,
  jsonError,
  jsonResponse,
  requireUserId,
} from "./http-utils";

interface HandlerOpts {
  database: Kysely<DB>;
}

export function characterEmotionAvatarsRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  const emotionAvatarService = new EmotionAvatarService(database,);

  return new Elysia({ name: "character-emotion-avatars", },)
    // ── List batch generation jobs ────────────────────────────────
    .get(prefix + "/actors/:actorId/emotion-avatars/jobs", async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      const { actorId, } = ctx.params as { actorId: string };
      if (!await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,)) {
        return forbidden(ctx.t?.("errors.forbidden",) ?? "Forbidden",);
      }
      const jobs = emotionAvatarService.listJobs(actorId,);
      return jsonResponse(jobs,);
    },)
    // ── Get specific job status ───────────────────────────────────
    .get(prefix + "/actors/:actorId/emotion-avatars/jobs/:jobId", async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      const { actorId, } = ctx.params as { actorId: string };
      if (!await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,)) {
        return forbidden(ctx.t?.("errors.forbidden",) ?? "Forbidden",);
      }
      const { jobId, } = ctx.params as { jobId: string };
      const job = emotionAvatarService.getJobStatus(jobId as any,);
      if (!job) { return jsonError({ message: "Job not found", status: HttpStatus.NotFound, },); }
      return jsonResponse(job,);
    },)
    // ── Cancel a running job ──────────────────────────────────────
    .post(prefix + "/actors/:actorId/emotion-avatars/jobs/:jobId/cancel", async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      const { actorId, } = ctx.params as { actorId: string };
      if (!await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,)) {
        return forbidden(ctx.t?.("errors.forbidden",) ?? "Forbidden",);
      }
      const { jobId, } = ctx.params as { jobId: string };
      const cancelled = emotionAvatarService.cancelJob(jobId as any,);
      if (!cancelled) {
        return jsonError({ message: "Job not found or already completed", status: HttpStatus.NotFound, },);
      }
      return jsonResponse({ ok: true, cancelled: true, },);
    },)
    // ── Start batch generation ───────────────────────────────────
    .post(prefix + "/actors/:actorId/emotion-avatars", async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      const { actorId, } = ctx.params as { actorId: string };
      if (!await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,)) {
        return forbidden(ctx.t?.("errors.forbidden",) ?? "Forbidden",);
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
        for (const e of emotionsParam) {
          if (!validEmotions.includes(e,)) {
            return jsonError({ message: `Invalid emotion: ${e}`, status: HttpStatus.BadRequest, },);
          }
        }
      }

      // eslint-disable-next-line unicorn/prefer-logical-operator-over-ternary
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
    .get(prefix + "/emotions/prompt-modifier/:emotion", async (ctx: any,) => {
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
    .get(prefix + "/emotions/types", async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      const emotions = Array.from(Object.values(EmotionType,), (emotion,) => ({
        value: emotion,
        displayName: emotion.charAt(0,).toUpperCase() + emotion.slice(1,),
      }),);
      return jsonResponse(emotions,);
    },);
}
