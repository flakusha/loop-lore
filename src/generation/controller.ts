// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generation Controller
 *
 * Elysia plugin for LLM generation control routes.
 *
 *   POST /api/v1/generation/generate       — Main generation endpoint
 *   POST /api/v1/generation/cancel         — Cancel active generation
 *   GET  /api/v1/generation/status/:chatId — Check generation status
 *   GET  /api/v1/generation/stream/:chatId — HTMX SSE streaming
 *   GET  /api/v1/generation/active         — List active
 *   POST /api/v1/generation/retry          — Retry with step-from-point
 *   POST /api/v1/generation/continue       — Continue partial/cancelled message
 *   POST /api/v1/generation/regenerate     — Replace AI response
 *   POST /api/v1/generation/image          — Generate image from prompt
 *   POST /api/v1/generation/video          — Generate video via a ComfyUI workflow
 *   GET  /api/v1/generation/video/status/:jobId — Poll a submitted video job
 *   POST /api/v1/generation/audio/ambient  — Generate layered ambient scene audio
 *   POST /api/v1/generation/caption        — Caption image assets
 *   POST /api/v1/generation/prompt         — Improve/analyze prompt drafts
 */

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { handleAmbientGeneration, } from "./audio-gen-route";
import { handleImageCaption, } from "./caption-route";
import { handleGenerate, } from "./generate-route";
import {
  handleBackupHashes,
  handleBackupRestore,
  handleCancelGeneration,
  handleContinueGeneration,
  handleGenerationStatus,
  handleGenerationStream,
  handleListActiveGenerations,
  handleQuotaOverride,
  handleQuotaState,
  handleRegenerate,
  handleRetryGeneration,
  handleTestConnection,
} from "./generation-routes";
import { handleImageGeneration, } from "./image-gen-route";
import { handlePromptImprove, } from "./prompt-route";
import { handleVideoGeneration, handleVideoGenerationStatus, } from "./video-gen-route";

// ── Helpers ──────────────────────────────────────────────────

import { handleAudioGeneration, } from "./audio-prompt-route";

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Generation Controller
 *
 * Elysia plugin for LLM generation control routes.
 *
 *   POST /api/v1/generation/generate       — Main generation endpoint
 *   POST /api/v1/generation/cancel         — Cancel active generation
 *   GET  /api/v1/generation/status/:chatId — Check generation status
 *   GET  /api/v1/generation/stream/:chatId — HTMX SSE streaming
 *   GET  /api/v1/generation/active         — List active
 *   POST /api/v1/generation/retry          — Retry with step-from-point
 *   POST /api/v1/generation/continue       — Continue partial/cancelled message
 *   POST /api/v1/generation/regenerate     — Replace AI response
 *   POST /api/v1/generation/image          — Generate image from prompt
 *   POST /api/v1/generation/video          — Generate video via a ComfyUI workflow
 *   GET  /api/v1/generation/video/status/:jobId — Poll a submitted video job
 *   POST /api/v1/generation/audio/ambient  — Generate layered ambient scene audio
 *   POST /api/v1/generation/caption        — Caption image assets
 *   POST /api/v1/generation/prompt         — Improve/analyze prompt drafts
 */
// ── Helpers ──────────────────────────────────────────────────

/**
 * Read the parsed JSON body already populated on the Elysia context.
 * Elysia's body inference pre-parses JSON whenever a handler references
 * `ctx.body` or any helper that does so, so re-parsing the raw request
 * stream would throw "Body already used". See
 * BUG-asset-link-share-json-routes-500-body-already-used-elysia-su
 * for the upstream precedent (asset-links fix 5a647564).
 * @param ctx
 * @param ctx.body
 */
function readBody(ctx: { body: unknown },): unknown {
  return ctx.body;
}

// ── Plugin ───────────────────────────────────────────────────

/**
 * @param root0
 * @param root0.database
 * @param root0.config
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, {}, { derive: {}; resolve: {}; schema: {}; standaloneSchema: {}; response: {}; }, { ...; }>}
 */
export function generationRoutes(
  { database, config, }: { database: Kysely<DB>; config: Config },
  prefix = "/api/v1",
): Elysia {
  const app = new Elysia({ name: "generation", },);

  app.post(`${prefix}/generation/generate`, async (ctx,) => {
    const auth = ctx as unknown as { userId?: string; userRole?: string | null };
    return handleGenerate({
      body: readBody(ctx,),
      database,
      config,
      userId: auth.userId,
      userRole: auth.userRole,
    },);
  },);

  app.post(`${prefix}/generation/cancel`, async (ctx,) => {
    const auth = ctx as unknown as { userId?: string; userRole?: string | null };
    return handleCancelGeneration(readBody(ctx,), database, auth.userId, auth.userRole,);
  },);

  app.get(`${prefix}/generation/status/:chatId`, async (ctx,) => {
    const auth = ctx as unknown as { userId?: string; userRole?: string | null };
    return handleGenerationStatus(ctx.params.chatId, database, auth.userId, auth.userRole,);
  },);

  app.get(`${prefix}/generation/stream/:chatId`, async (ctx,) => {
    const auth = ctx as unknown as { userId?: string; userRole?: string | null };
    return handleGenerationStream(ctx.params.chatId, ctx.request.headers, database, auth.userId, auth.userRole,);
  },);

  app.get(`${prefix}/generation/active`, async (ctx,) => {
    const auth = ctx as unknown as { userId?: string; userRole?: string | null };
    return handleListActiveGenerations(database, auth.userId, auth.userRole,);
  },);

  app.post(`${prefix}/generation/retry`, async (ctx,) => {
    const auth = ctx as unknown as { userId?: string; userRole?: string | null };
    return handleRetryGeneration(readBody(ctx,), database, auth.userId, auth.userRole,);
  },);

  app.post(`${prefix}/generation/continue`, async (ctx,) => {
    const auth = ctx as unknown as { userId?: string; userRole?: string | null };
    return handleContinueGeneration(readBody(ctx,), database, auth.userId, auth.userRole,);
  },);

  app.post(`${prefix}/generation/regenerate`, async (ctx,) => {
    const auth = ctx as unknown as { userId?: string | null; userRole?: string | null };
    return handleRegenerate(readBody(ctx,), database, {
      userId: auth.userId ?? null,
      userRole: auth.userRole ?? null,
    }, config,);
  },);

  app.post(`${prefix}/generation/image`, async (ctx,) => {
    const auth = ctx as unknown as { userId?: string | null; userRole?: string | null };
    return handleImageGeneration(readBody(ctx,), database, auth.userId ?? undefined, auth.userRole,);
  },);

  app.post(`${prefix}/generation/video`, async (ctx,) => {
    const auth = ctx as unknown as { userId?: string | null; userRole?: string | null };
    return handleVideoGeneration(readBody(ctx,), database, auth.userId ?? undefined, auth.userRole,);
  }, {
    // The summary and the tag are what the generated OpenAPI document
    // publishes for this route; without them the served reference carries a
    // bare path nobody can place.
    detail: {
      summary: "Submit a video generation job",
      description: "Starts a background render and returns 202 with the job id. Poll the status route for the " +
        "outcome; on success the clip is persisted as a video asset linked to the chat.",
      tags: ["Generation",],
    },
  },);

  app.get(`${prefix}/generation/video/status/:jobId`, async (ctx,) => {
    const auth = ctx as unknown as { userId?: string; userRole?: string | null };
    return handleVideoGenerationStatus(ctx.params.jobId, database, auth.userId, auth.userRole,);
  }, {
    detail: {
      summary: "Poll a video generation job",
      description: "The job's status and, once it succeeds, the persisted asset. A job owned by another " +
        "user reads as not found.",
      tags: ["Generation",],
    },
  },);

  app.post(`${prefix}/generation/caption`, async (ctx,) => {
    const auth = ctx as unknown as { userId?: string; userRole?: string | null };
    return handleImageCaption(readBody(ctx,), database, auth.userId, auth.userRole,);
  },);

  app.post(`${prefix}/generation/audio/ambient`, async (ctx,) => {
    const auth = ctx as unknown as { userId?: string | null; userRole?: string | null };
    return handleAmbientGeneration(readBody(ctx,), database, auth.userId ?? undefined, auth.userRole,);
  },);

  app.post(`${prefix}/generation/audio`, async (ctx,) => {
    const auth = ctx as unknown as { userId?: string | null; userRole?: string | null };
    return handleAudioGeneration(readBody(ctx,), database, auth.userId ?? undefined, auth.userRole,);
  },);

  app.post(`${prefix}/generation/prompt`, async (ctx,) => {
    const auth = ctx as unknown as { userId?: string; userRole?: string | null };
    return handlePromptImprove(readBody(ctx,), database, auth.userId, auth.userRole,);
  },);

  app.post(`${prefix}/generation/test-connection`, async (ctx,) => {
    const auth = ctx as unknown as { userId?: string };
    return handleTestConnection(readBody(ctx,), config, auth.userId,);
  },);

  app.get(`${prefix}/generation/quota-state`, async (ctx,) => {
    const auth = ctx as unknown as { userId?: string; userRole?: string | null };
    return handleQuotaState(database, auth.userId, auth.userRole,);
  },);

  app.post(`${prefix}/generation/quota/override`, async (ctx,) => {
    const auth = ctx as unknown as { userId?: string; userRole?: string | null };
    return handleQuotaOverride(readBody(ctx,), database, auth.userId, auth.userRole,);
  },);

  app.get(`${prefix}/settings/backups/hashes`, async (ctx,) => {
    const auth = ctx as unknown as { userId?: string; userRole?: string | null };
    return handleBackupHashes(database, auth.userId, auth.userRole,);
  },);

  app.post(`${prefix}/settings/backups/:id/restore`, async (ctx,) => {
    const auth = ctx as unknown as { userId?: string; userRole?: string | null };
    const params = ctx.params as { id?: string };
    return handleBackupRestore(readBody(ctx,), params.id ?? "", database, auth.userId, auth.userRole,);
  },);

  return app;
}
