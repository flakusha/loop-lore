// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Confirm endpoint for `/create` entity drafts.
 *
 * The `create` command generates an entity, runs quality gates, and returns a
 * `create-entity-preview` action carrying the draft. This route is the user's
 * approval step: it re-validates the draft server-side (never trust the
 * payload blindly) and persists it. Split out of `create.ts` to keep that
 * route under the size budget.
 */

import { Elysia, t, } from "elysia";
import { insertGeneratedEntity, } from "../../assistant/commands/create-entity";
import type { EntityKind, } from "../../assistant/prompt/templates/entity-generation";
import {
  normalizeEntity,
  validateEntitySchema,
} from "../../assistant/quality/entity-creation";
import { checkChatAccess, } from "../../chat/service";
import { ChatIdParams, ErrorResponse, } from "../../validation/schemas";
import { jsonCreated, jsonResponse, requireUserId, } from "../http-utils";
import { requireWorldOwner, } from "../worlds/access";
import { serviceErrorToResponse, } from "./helpers";
import type { HandlerOpts, } from "./types";

/** Kinds the confirm endpoint is willing to persist. */
const ALLOWED_KINDS: Record<string, true> = {
  character: true,
  location: true,
  world: true,
  item: true,
};

/**
 * @param opts
 * @param prefix
 */
export function createEntityConfirmRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "messages-create-entity-confirm", },)
    .post(
      `${prefix}/chats/:id/create-entity`,
      async (ctx,) => {
        const actorId = requireUserId(ctx,);
        if (typeof actorId !== "string") { return actorId; }
        const { id: chatId, } = ctx.params;
        const access = await checkChatAccess(database, chatId, actorId, null,);
        if (!access.ok) { return serviceErrorToResponse(access.error,); }

        const body = ctx.body as {
          kind?: string;
          data?: Record<string, unknown>;
          description?: string;
          worldId?: string | null;
        };

        // Cross-user write guard: when a world is targeted, the caller must
        // own it — otherwise a user could inject entities into a world they
        // do not control (IDOR write, BUG-create-entity-confirm-bypasses-world-ownership).
        if (typeof body.worldId === "string" && body.worldId.length > 0) {
          const worldGuard = await requireWorldOwner(database, body.worldId, actorId, null,);
          if (worldGuard) { return worldGuard; }
        }

        if (!body.kind || !ALLOWED_KINDS[body.kind]) {
          return jsonResponse({ error: "Invalid entity kind.", }, 400,);
        }
        if (!body.data || typeof body.data.name !== "string" || !body.data.name.trim()) {
          return jsonResponse({ error: "Entity data missing a name.", }, 400,);
        }

        // Re-validate the draft server-side before persisting.
        const kind = body.kind as EntityKind;
        const entity = normalizeEntity(body.data,);
        const schema = validateEntitySchema(kind, entity,);
        if (!schema.ok) {
          return jsonResponse({ error: `Invalid entity: ${schema.message}`, }, 422,);
        }

        const inserted = await insertGeneratedEntity(database, {
          kind,
          data: entity,
          description: body.description ?? "",
          worldId: body.worldId ?? undefined,
        }, actorId,);
        return jsonCreated({
          id: inserted.id,
          kind: inserted.kind,
          name: inserted.name,
          linkedChatId: inserted.linkedChatId ?? null,
        },);
      },
      {
        params: ChatIdParams,
        body: t.Object({
          kind: t.String(),
          data: t.Object({ name: t.String(), }, { additionalProperties: true, },),
          description: t.Optional(t.String(),),
          worldId: t.Optional(t.Union([t.String(), t.Null(),],),),
        },),
        response: {
          201: t.Object({
            id: t.String(),
            kind: t.String(),
            name: t.String(),
            linkedChatId: t.Union([t.String(), t.Null(),],),
          },),
          400: ErrorResponse,
          422: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
      },
    );
}
