// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generation Controller
 *
 * Elysia plugin for LLM generation control routes.
 *
 *   POST /api/generation/generate       — Main generation endpoint
 *   POST /api/generation/cancel         — Cancel active generation
 *   GET  /api/generation/status/:chatId — Check generation status
 *   GET  /api/generation/stream/:chatId — HTMX SSE streaming
 *   GET  /api/generation/active         — List active
 *   POST /api/generation/retry          — Retry with step-from-point
 *   POST /api/generation/continue       — Continue partial/cancelled message
 *   POST /api/generation/regenerate     — Replace AI response
 *   POST /api/generation/image          — Generate image from prompt
 *   POST /api/generation/caption        — Caption image assets
 *   POST /api/generation/test-connection — Test provider connection
 */

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { handleImageCaption, } from "./caption-route";
import { handleGenerate, } from "./generate-route";
import {
  handleCancelGeneration,
  handleContinueGeneration,
  handleGenerationStatus,
  handleGenerationStream,
  handleListActiveGenerations,
  handleRegenerate,
  handleRetryGeneration,
  handleTestConnection,
} from "./generation-routes";
import { handleImageGeneration, } from "./image-gen-route";

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
 */
export function generationRoutes({ database, config, }: { database: Kysely<DB>; config: Config },): Elysia {
  const app = new Elysia({ name: "generation", },);

  app.post("/api/generation/generate", async (ctx,) => {
    const auth = ctx as unknown as { userId?: string; userRole?: string | null };
    return handleGenerate({
      body: readBody(ctx,),
      database,
      config,
      userId: auth.userId,
      userRole: auth.userRole,
    },);
  },);

  app.post("/api/generation/cancel", async (ctx,) => {
    const auth = ctx as unknown as { userId?: string; userRole?: string | null };
    return handleCancelGeneration(readBody(ctx,), database, auth.userId, auth.userRole,);
  },);

  app.get("/api/generation/status/:chatId", async (ctx,) => {
    const auth = ctx as unknown as { userId?: string; userRole?: string | null };
    return handleGenerationStatus(ctx.params.chatId, database, auth.userId, auth.userRole,);
  },);

  app.get("/api/generation/stream/:chatId", async (ctx,) => {
    const auth = ctx as unknown as { userId?: string; userRole?: string | null };
    return handleGenerationStream(ctx.params.chatId, ctx.request.headers, database, auth.userId, auth.userRole,);
  },);

  app.get("/api/generation/active", async (ctx,) => {
    const auth = ctx as unknown as { userId?: string; userRole?: string | null };
    return handleListActiveGenerations(database, auth.userId, auth.userRole,);
  },);

  app.post("/api/generation/retry", async (ctx,) => {
    const auth = ctx as unknown as { userId?: string; userRole?: string | null };
    return handleRetryGeneration(readBody(ctx,), database, auth.userId, auth.userRole,);
  },);

  app.post("/api/generation/continue", async (ctx,) => {
    const auth = ctx as unknown as { userId?: string; userRole?: string | null };
    return handleContinueGeneration(readBody(ctx,), database, auth.userId, auth.userRole,);
  },);

  app.post("/api/generation/regenerate", async (ctx,) => {
    const auth = ctx as unknown as { userId?: string | null; userRole?: string | null };
    return handleRegenerate(readBody(ctx,), database, {
      userId: auth.userId ?? null,
      userRole: auth.userRole ?? null,
    },);
  },);

  app.post("/api/generation/image", async (ctx,) => {
    const auth = ctx as unknown as { userId?: string | null; userRole?: string | null };
    return handleImageGeneration(readBody(ctx,), database, auth.userId ?? undefined, auth.userRole,);
  },);

  app.post("/api/generation/caption", async (ctx,) => {
    const auth = ctx as unknown as { userId?: string; userRole?: string | null };
    return handleImageCaption(readBody(ctx,), database, auth.userId, auth.userRole,);
  },);

  app.post("/api/generation/test-connection", async (ctx,) => {
    const auth = ctx as unknown as { userId?: string };
    return handleTestConnection(readBody(ctx,), config, auth.userId,);
  },);

  return app;
}
