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
import {
  ActorIdParams,
  ActorJobParams,
  EmotionAvatarBatchBody,
  ErrorResponse,
  SuccessResponse,
} from "../validation/schemas";
import { jsonCreated, jsonError, jsonResponse, } from "./http-utils";
import { HttpStatus, } from "./http-utils";

interface HandlerOpts {
  database: Kysely<DB>;
}

export function characterEmotionAvatarsRoutes(opts: HandlerOpts,) {
  const { database, } = opts;
  const emotionAvatarService = new EmotionAvatarService(database,);

  return new Elysia({ name: "character-emotion-avatars", },)
    // ── List batch generation jobs ────────────────────────────────
    .get("/api/actors/:actorId/emotion-avatars/jobs", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const { actorId, } = ctx.params;
      const jobs = emotionAvatarService.listJobs(actorId as string,);
      return jsonResponse(jobs,);
    }, {
      params: ActorIdParams,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "List emotion avatar jobs",
        description: "List batch generation jobs for emotion avatars.",
        tags: ["Emotion Avatars",],
      },
    },)
    // ── Get specific job status ───────────────────────────────────
    .get("/api/actors/:actorId/emotion-avatars/jobs/:jobId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const { jobId, } = ctx.params;
      const job = emotionAvatarService.getJobStatus(jobId,);
      if (!job) {
        return jsonError({
          message: ctx.t?.("characters.emotionJobNotFound",) ?? "Job not found",
          status: HttpStatus.NotFound,
        },);
      }
      return jsonResponse(job,);
    }, {
      params: ActorJobParams,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Get emotion avatar job status",
        description: "Get the status of a specific batch generation job.",
        tags: ["Emotion Avatars",],
      },
    },)
    // ── Cancel a running job ──────────────────────────────────────
    .post("/api/actors/:actorId/emotion-avatars/jobs/:jobId/cancel", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const { jobId, } = ctx.params;
      const cancelled = emotionAvatarService.cancelJob(jobId,);
      if (!cancelled) {
        return jsonError({
          message: ctx.t?.("characters.emotionJobAlreadyCompleted",) ?? "Job not found or already completed",
          status: HttpStatus.NotFound,
        },);
      }
      return jsonResponse({ ok: true, cancelled: true, },);
    }, {
      params: ActorJobParams,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Cancel emotion avatar job",
        description: "Cancel a running batch generation job.",
        tags: ["Emotion Avatars",],
      },
    },)
    // ── Start batch generation ───────────────────────────────────
    .post("/api/actors/:actorId/emotion-avatars", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const { actorId, } = ctx.params;
      const { baseAvatarId, emotions: emotionsParam, promptPrefix, negativePrompt, } = ctx.body;

      try {
        const jobId = await emotionAvatarService.startBatchGeneration({
          actorId: actorId as string,
          baseAvatarId: baseAvatarId as string,
          emotions: emotionsParam as EmotionType[] | undefined,
          promptPrefix: promptPrefix as string | undefined,
          negativePrompt: negativePrompt as string | undefined,
        },);
        return jsonCreated({ jobId, },);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to start generation";
        return jsonError({ message, status: HttpStatus.BadRequest, },);
      }
    }, {
      params: ActorIdParams,
      body: EmotionAvatarBatchBody,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Start emotion avatar batch generation",
        description: "Start a batch generation job to create emotion variants of an avatar.",
        tags: ["Emotion Avatars",],
      },
    },)
    // ── Get emotion prompt modifier ──────────────────────────────
    .get("/api/emotions/prompt-modifier/:emotion", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const { emotion, } = ctx.params as { emotion: string };
      const validEmotions = Object.values(EmotionType,) as string[];
      if (!validEmotions.includes(emotion,)) {
        return jsonError({ message: `Invalid emotion: ${emotion}`, status: HttpStatus.BadRequest, },);
      }
      const modifier = emotionAvatarService.getEmotionPromptModifier(emotion as EmotionType,);
      return jsonResponse({ emotion, modifier, },);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Get emotion prompt modifier",
        description: "Get the prompt modifier for a specific emotion type.",
        tags: ["Emotion Avatars",],
      },
    },)
    // ── List available emotion types ───────────────────────────
    .get("/api/emotions/types", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const emotions = Object.values(EmotionType,).map((emotion,) => ({
        value: emotion,
        displayName: emotion.charAt(0,).toUpperCase() + emotion.slice(1,),
      }));
      return jsonResponse(emotions,);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "List emotion types",
        description: "List all available emotion types for avatar generation.",
        tags: ["Emotion Avatars",],
      },
    },);
}
