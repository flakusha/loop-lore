// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Story-triggered entity-generation handoff endpoint.
 *
 * POST /api/chats/:id/generate-entity — create a private, requester-owned
 * creation chat seeded with the entity information gathered
 * from the story, and start the kind's guided workflow in it. Persistence of
 * the finalized spec remains behind the existing create-entity confirm gate.
 */

import { Elysia, t, } from "elysia";
import { ENTITY_SPEC_KINDS, } from "../../assistant/entity-spec/entity-spec-kinds";
import { handoffToEntityCreationChat, } from "../../assistant/entity-spec/handoff";
import { checkChatAccess, } from "../../chat/service";
import { ErrorResponse, } from "../../validation/schemas";
import { jsonCreated, jsonResponse, requireUserId, } from "../http-utils";
import { serviceErrorToResponse, } from "../messages/helpers";
import type { HandlerOpts, } from "./types";

/**
 * @param opts
 * @param prefix
 */
export function generateEntityRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, config, } = opts;

  return new Elysia({ name: "chats-generate-entity", },).post(
    `${prefix}/chats/:id/generate-entity`,
    async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const { id: sourceChatId, } = ctx.params;

      const access = await checkChatAccess(database, sourceChatId, userId, null,);
      if (!access.ok) { return serviceErrorToResponse(access.error,); }

      const body = ctx.body as {
        kind?: string;
        seed?: string;
      };

      const kind = body.kind ?? "";
      if (!ENTITY_SPEC_KINDS.includes(kind as never,)) {
        return jsonResponse(
          { error: `Invalid entity kind; expected one of: ${ENTITY_SPEC_KINDS.join(", ",)}`, },
          400,
        );
      }
      const seed = typeof body.seed === "string" ? body.seed.trim() : "";
      if (seed === "") {
        return jsonResponse({ error: "Seed text is required.", }, 400,);
      }

      const workflows = Object.values(config.templates.workflows.workflows,);
      const result = await handoffToEntityCreationChat(database, {
        kind,
        seed,
        sourceChatId,
        userId,
        workflows,
      },);
      if (!result.ok) {
        return jsonResponse({ error: result.message, }, result.code === "chat_create_failed" ? 500 : 400,);
      }

      return jsonCreated({
        chatId: result.value.chatId,
        kind: result.value.descriptor.kind,
        workflowId: result.value.workflow.id,
      },);
    },
    {
      body: t.Object({
        kind: t.String(),
        seed: t.String(),
      },),
      response: {
        201: t.Object({
          chatId: t.String(),
          kind: t.String(),
          workflowId: t.String(),
        },),
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
        500: ErrorResponse,
      },
    },
  );
}
