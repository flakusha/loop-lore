// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/ops/generation.ts — facade ops over the
// generation control plane (TASK-FACADE-SLICE-CHAT-AND-GENERATION-OPS).
//
// PURE DELEGATION: the handle* functions are the exact seams the HTTP plugin
// mounts (src/generation/controller.ts:78-124) and each runs its own
// authoritative validation + route-level authz internally (e.g.
// handleGenerate -> validateGenerateRequest at generate-route/handler.ts:75),
// so the facade adds scope/budget/audit around them and re-implements
// NOTHING. Streaming (GET /generation/stream/:chatId) is transport-specific
// HTMX SSE and is deliberately NOT a facade op.

import { generationPolicy, } from "../../../api-governance/rate-limiting/policies";
import { handleGenerate, } from "../../../generation/generate-route";
import {
  handleCancelGeneration,
  handleContinueGeneration,
  handleGenerationStatus,
  handleListActiveGenerations,
  handleRegenerate,
  handleRetryGeneration,
} from "../../../generation/generation-routes";
import { type FacadeRegistry, facadeResultFromResponse, } from "../registry";
import type { FacadeContext, FacadeOp, } from "../types";

/** Shared registration deps — the same shape generationRoutes receives. */
export interface GenerationFacadeDeps {
  database: FacadeContext["database"];
  config: FacadeContext["config"];
}

/** The chatId field ops read off the body (the route reads it off the URL). */
interface ChatIdBody {
  chatId?: unknown;
}

/** Extract a string chatId from a body, or null when absent/malformed. */
function chatIdFromBody(body: unknown,): string | null {
  const candidate = (body as ChatIdBody | null)?.chatId;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

/** Type-narrowed facade user fields (authz has already required userId).
 * @param ctx - the facade context
 * @returns the non-null userId + role
 * @throws {TypeError} when the context lost its user principal
 */
function identity(ctx: FacadeContext,): { userId: string; userRole: string | null } {
  // authorizeFacadeOp guarantees non-null before any handler runs; this
  // defensive re-check keeps the types honest without a bare assertion.
  if (ctx.principal.userId === null) {
    throw new TypeError("facade op reached handler without a user principal",);
  }

  return { userId: ctx.principal.userId, userRole: ctx.principal.userRole, };
}

/**
 * Register the generation control-plane ops on a registry.
 * @param registry - the facade registry
 * @param deps - database/config the wrapped handlers receive
 * @throws {Error} when an op name collides on registration
 */
export function registerGenerationOps(registry: FacadeRegistry, deps: GenerationFacadeDeps,): void {
  const { database, config, } = deps;

  const ops: FacadeOp[] = [
    {
      name: "generation.generate",
      domain: "generation",
      summary: "Run an LLM generation turn for a chat message",
      description: "Same pipeline as POST /api/v1/generation/generate. Body passes through to handleGenerate, " +
        "which validates chatId/parentMessageId/actorId/idempotencyKey and enforces chat access, " +
        "actor membership, flow control, and per-chat holds before any provider call.",
      scope: "chat-write",
      ratePolicy: generationPolicy,
      handler: async (ctx, body,) => {
        const { userId, userRole, } = identity(ctx,);
        return facadeResultFromResponse(
          await handleGenerate({
            body,
            database,
            config,
            userId,
            userRole,
          },),
        );
      },
    },
    {
      name: "generation.cancel",
      domain: "generation",
      summary: "Cancel the active generation of a chat",
      description: "Same pipeline as POST /api/v1/generation/cancel.",
      scope: "chat-write",
      ratePolicy: generationPolicy,
      handler: async (ctx, body,) => {
        const { userId, userRole, } = identity(ctx,);
        return facadeResultFromResponse(await handleCancelGeneration(body, database, userId, userRole,),);
      },
    },
    {
      name: "generation.status",
      domain: "generation",
      summary: "Check whether a chat has an active generation",
      description: "Same pipeline as GET /api/v1/generation/status/:chatId.",
      scope: "read",
      ratePolicy: generationPolicy,
      handler: async (ctx, body,) => {
        const { userId, userRole, } = identity(ctx,);
        const chatId = chatIdFromBody(body,);
        if (chatId === null) {
          return { ok: false, status: 400, json: { error: "bad_request", message: "chatId is required", }, };
        }

        return facadeResultFromResponse(await handleGenerationStatus(chatId, database, userId, userRole,),);
      },
    },
    {
      name: "generation.active",
      domain: "generation",
      summary: "List the caller's active generations",
      description: "Same pipeline as GET /api/v1/generation/active.",
      scope: "read",
      ratePolicy: generationPolicy,
      handler: async (ctx, body,) => {
        void body;
        const { userId, userRole, } = identity(ctx,);
        return facadeResultFromResponse(await handleListActiveGenerations(database, userId, userRole,),);
      },
    },
    {
      name: "generation.retry",
      domain: "generation",
      summary: "Retry a generation from a chosen step",
      description: "Same pipeline as POST /api/v1/generation/retry.",
      scope: "chat-write",
      ratePolicy: generationPolicy,
      handler: async (ctx, body,) => {
        const { userId, userRole, } = identity(ctx,);
        return facadeResultFromResponse(await handleRetryGeneration(body, database, userId, userRole,),);
      },
    },
    {
      name: "generation.continue",
      domain: "generation",
      summary: "Continue a partial or cancelled generation",
      description: "Same pipeline as POST /api/v1/generation/continue.",
      scope: "chat-write",
      ratePolicy: generationPolicy,
      handler: async (ctx, body,) => {
        const { userId, userRole, } = identity(ctx,);
        return facadeResultFromResponse(await handleContinueGeneration(body, database, userId, userRole,),);
      },
    },
    {
      name: "generation.regenerate",
      domain: "generation",
      summary: "Replace an AI response with a fresh generation",
      description: "Same pipeline as POST /api/v1/generation/regenerate.",
      scope: "chat-write",
      ratePolicy: generationPolicy,
      handler: async (ctx, body,) => {
        const { userId, userRole, } = identity(ctx,);
        return facadeResultFromResponse(await handleRegenerate(body, database, { userId, userRole, }, config,),);
      },
    },
  ];

  for (const op of ops) {
    const registered = registry.register(op,);
    if (!registered.ok) {
      throw new Error(registered.message,);
    }
  }
}
