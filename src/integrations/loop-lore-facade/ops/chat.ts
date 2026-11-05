// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/ops/chat.ts — facade ops over the chat
// message pipeline (TASK-FACADE-SLICE-CHAT-AND-GENERATION-OPS).
//
// Both ops call the SAME extracted services the HTTP routes call
// (send-message.ts / list-page.ts — pure refactors of the route handlers), so
// every gate (access, mute, idempotency, VN, injection, GM tools) runs
// identically for agents and browser clients. Validation reuses the route's
// TypeBox schemas — the facade composes chatId AROUND MessageCreateBody (the
// route carries chatId in the URL, the facade in the body) and never
// re-declares a message field.

import { type Static, } from "@sinclair/typebox";
import { Value, } from "@sinclair/typebox/value";
import { t, } from "elysia";
import type { Kysely, } from "kysely";
import { chatPolicy, } from "../../../api-governance/rate-limiting/policies";
import type { Config, } from "../../../config/schema";
import type { DB, } from "../../../db/schema";
import { listChatMessagesPage, type MessageListQuery, } from "../../../routes/messages/list-page";
import { sendUserMessage, } from "../../../routes/messages/send-message";
import { MessageCreateBody, } from "../../../validation/schemas";
import { type FacadeRegistry, facadeResultFromResponse, } from "../registry";
import type { FacadeContext, FacadeOp, FacadeResult, } from "../types";

/** Shared registration deps — the same shape HandlerOpts carries. */
export interface ChatFacadeDeps {
  database: Kysely<DB>;
  config: Config;
}

/** Facade chat.send body: the route's URL chatId + the route's body schema. */
export const FacadeSendMessageBody = t.Object({
  chatId: t.String({ minLength: 1, },),
  ...MessageCreateBody.properties,
},);

/** Facade chat.history body: chatId + the route's list query fields. */
export const FacadeListMessagesBody = t.Object({
  chatId: t.String({ minLength: 1, },),
  page: t.Optional(t.Numeric(),),
  pageSize: t.Optional(t.Numeric(),),
  parentId: t.Optional(t.String(),),
  translateLocale: t.Optional(t.String(),),
},);

/**
 * Synthetic request for the pipeline steps that only read headers
 * (maybeAutoReply x-request-id, detectLocale Accept-Language). A headerless
 * POST behaves exactly like an HTTP call without those headers.
 * @param opName - the facade op, for a stable pseudo-URL
 * @returns the synthetic Request
 */
function syntheticRequest(opName: string,): Request {
  return new Request(`http://loop-lore-facade.local/ops/${opName}`, { method: "POST", },);
}

/** Type-narrowed facade user fields (authz has already required userId).
 * @param ctx - the facade context
 * @returns the non-null userId + role
 * @throws {TypeError} when the context lost its user principal
 */
function identity(ctx: FacadeContext,): { userId: string; userRole: string | null } {
  if (ctx.principal.userId === null) {
    throw new TypeError("facade op reached handler without a user principal",);
  }

  return { userId: ctx.principal.userId, userRole: ctx.principal.userRole, };
}

/** Shared 400 rejection for bodies failing the facade schema. */
function badBody(opName: string,): FacadeResult {
  return {
    ok: false,
    status: 400,
    json: { error: "bad_request", message: `body does not match the ${opName} schema`, },
  };
}

/**
 * Register the chat ops on a registry.
 * @param registry - the facade registry
 * @param deps - database/config the wrapped services receive
 * @throws {Error} when an op name collides on registration
 */
export function registerChatOps(registry: FacadeRegistry, deps: ChatFacadeDeps,): void {
  const { database, config, } = deps;

  const ops: FacadeOp[] = [
    {
      name: "chat.send",
      domain: "chat",
      summary: "Send a user message into a chat and attempt the auto-reply",
      description: "Same pipeline as POST /api/v1/chats/:id/messages: whitespace trim, access/mute/VN/idempotency " +
        "gates, asset mentions, profanity + injection gates, slash commands, GM tools, storage, and " +
        "post-insert effects. Honors idempotencyKey replays.",
      scope: "chat-write",
      ratePolicy: chatPolicy,
      bodySchema: FacadeSendMessageBody,
      handler: async (ctx, body,) => {
        if (!Value.Check(FacadeSendMessageBody, body,)) { return badBody("chat.send",); }
        // Value.Check is a boolean guard; the narrowing cast is the typebox idiom.
        const parsed = body as Static<typeof FacadeSendMessageBody>;
        const { userId, userRole, } = identity(ctx,);
        const { chatId, ...messageBody } = parsed;
        return facadeResultFromResponse(
          await sendUserMessage({
            database,
            config,
            userId,
            userRole,
            chatId,
            body: messageBody,
            request: syntheticRequest("chat.send",),
          },),
        );
      },
    },
    {
      name: "chat.history",
      domain: "chat",
      summary: "List one page of a chat's messages, enriched for rendering",
      description: "Same pipeline as GET /api/v1/chats/:id/messages: chat access check, pagination, message " +
        "enrichment, server-side avatar resolution, and read-time translation negotiation.",
      scope: "read",
      ratePolicy: chatPolicy,
      bodySchema: FacadeListMessagesBody,
      handler: async (ctx, body,) => {
        if (!Value.Check(FacadeListMessagesBody, body,)) { return badBody("chat.history",); }
        const parsed = body as Static<typeof FacadeListMessagesBody>;
        const { userId, userRole, } = identity(ctx,);
        const query: MessageListQuery = {
          page: parsed.page,
          pageSize: parsed.pageSize,
          parentId: parsed.parentId,
          translateLocale: parsed.translateLocale,
        };

        return facadeResultFromResponse(
          await listChatMessagesPage({
            database,
            config,
            userId,
            userRole,
            chatId: parsed.chatId,
            query,
            request: syntheticRequest("chat.history",),
            translator: undefined,
            // Same per-route precompute read.ts does for its list endpoints.
            regexTransforms: config.generation?.regexTransforms ?? [],
          },),
        );
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
