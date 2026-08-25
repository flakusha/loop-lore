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
 */
function readBody(ctx: { body: unknown },): unknown {
  return ctx.body;
}

// ── Plugin ───────────────────────────────────────────────────

export function generationRoutes({ database, config, }: { database: Kysely<DB>; config: Config },): Elysia {
  const app = new Elysia({ name: "generation", },);

  app.post("/api/generation/generate", async (ctx,) => {
    const auth = ctx as unknown as { userId?: string };
    return handleGenerate({ body: readBody(ctx,), database, config, userId: auth.userId, },);
  },);

  app.post("/api/generation/cancel", async (ctx,) => {
    return handleCancelGeneration(readBody(ctx,), database,);
  },);

  app.get("/api/generation/status/:chatId", (ctx,) => {
    return handleGenerationStatus(ctx.params.chatId, database,);
  },);

  app.get("/api/generation/stream/:chatId", (ctx,) => {
    return handleGenerationStream(ctx.params.chatId, ctx.request.headers,);
  },);

  app.get("/api/generation/active", () => {
    return handleListActiveGenerations(database,);
  },);

  app.post("/api/generation/retry", async (ctx,) => {
    return handleRetryGeneration(readBody(ctx,), database,);
  },);

  app.post("/api/generation/continue", async (ctx,) => {
    return handleContinueGeneration(readBody(ctx,), database,);
  },);

  app.post("/api/generation/regenerate", async (ctx,) => {
    const auth = ctx as unknown as { userId?: string | null; userRole?: string | null };
    return handleRegenerate(readBody(ctx,), database, {
      userId: auth.userId ?? null,
      userRole: auth.userRole ?? null,
    },);
  },);

  app.post("/api/generation/image", async (ctx,) => {
    const auth = ctx as unknown as { userId?: string | null };
    return handleImageGeneration(readBody(ctx,), auth.userId ?? undefined,);
  },);

  app.post("/api/generation/caption", async (ctx,) => {
    const auth = ctx as unknown as { userId?: string };
    return handleImageCaption(readBody(ctx,), auth.userId,);
  },);

  app.post("/api/generation/test-connection", async (ctx,) => {
    return handleTestConnection(readBody(ctx,), config,);
  },);

  return app;
}
