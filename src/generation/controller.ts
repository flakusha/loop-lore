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
import { jsonError, } from "../routes/http-utils";
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

/** Parse JSON request body, returning an error Response on parse failure */
async function parseJsonBody(request: Request,): Promise<unknown> {
  try {
    return await request.json();
  } catch (parseError) {
    return jsonError({ message: `Invalid JSON: ${(parseError as Error).message}`, status: 400, },);
  }
}

// ── Plugin ───────────────────────────────────────────────────

export function generationRoutes({ database, config, }: { database: Kysely<DB>; config: Config },): Elysia {
  const app = new Elysia({ name: "generation", },);

  app.post("/api/generation/generate", async (ctx,) => {
    const body = await parseJsonBody(ctx.request,);
    if (body instanceof Response) { return body; }
    return handleGenerate({ body, database, config, userId: (ctx as any).userId ?? undefined, },);
  },);

  app.post("/api/generation/cancel", async (ctx,) => {
    const body = await parseJsonBody(ctx.request,);
    if (body instanceof Response) { return body; }
    return handleCancelGeneration(body, database,);
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
    const body = await parseJsonBody(ctx.request,);
    if (body instanceof Response) { return body; }
    return handleRetryGeneration(body, database,);
  },);

  app.post("/api/generation/continue", async (ctx,) => {
    const body = await parseJsonBody(ctx.request,);
    if (body instanceof Response) { return body; }
    return handleContinueGeneration(body, database,);
  },);

  app.post("/api/generation/regenerate", async (ctx,) => {
    const body = await parseJsonBody(ctx.request,);
    if (body instanceof Response) { return body; }
    const auth = ctx as unknown as { userId?: string | null; userRole?: string | null };
    return handleRegenerate(body, database, {
      userId: auth.userId ?? null,
      userRole: auth.userRole ?? null,
    },);
  },);

  app.post("/api/generation/image", async (ctx,) => {
    const body = await parseJsonBody(ctx.request,);
    if (body instanceof Response) { return body; }
    return handleImageGeneration(body,);
  },);

  app.post("/api/generation/caption", async (ctx,) => {
    const body = await parseJsonBody(ctx.request,);
    if (body instanceof Response) { return body; }
    return handleImageCaption(body, (ctx as any).userId,);
  },);

  app.post("/api/generation/test-connection", async (ctx,) => {
    const body = await parseJsonBody(ctx.request,);
    if (body instanceof Response) { return body; }
    return handleTestConnection(body, config,);
  },);

  return app;
}
