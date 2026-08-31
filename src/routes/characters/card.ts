// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { can, } from "../../users/permissions";
import { jsonParseOr, } from "../../utils";
import {
  ActorIdParams,
  ErrorResponse,
} from "../../validation/schemas";
import { HttpStatus, jsonError, jsonResponse, } from "../http-utils";
import type { HandlerOpts, } from "./types";

/**
 * @param opts
 * @param prefix
 */
export function cardRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "characters-card", },)
    .get(
      `${prefix}/actors/:actorId/card`,
      async (ctx: any,) => {
        const actor = await database
          .selectFrom("actors",)
          .selectAll()
          .where("id", "=", ctx.params.actorId,)
          .executeTakeFirst();
        if (!actor) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
        }

        // Solo role is admin-equivalent for own actors
        const isAdminOrSolo = can(ctx.userRole, "admin.character",);
        if (!isAdminOrSolo && actor.visibility !== "public" && actor.user_id !== ctx.userId) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
        }

        const settings = jsonParseOr(actor.settings, {},) as Record<string, unknown>;
        const tags = Array.isArray(settings.tags,) ? settings.tags : [];
        const card = {
          spec: "chara_card_v2",
          spec_version: "2.0",
          data: {
            name: actor.display_name,
            description: actor.description ?? "",
            personality: actor.personality ?? "",
            scenario: actor.scenario ?? "",
            first_mes: actor.welcome_message ?? "",
            mes_example: actor.mes_example ?? "",
            system_prompt: actor.system_prompt ?? "",
            post_history_instructions: actor.post_history_instructions ?? "",
            alternate_greetings: actor.alternate_greetings ? jsonParseOr(actor.alternate_greetings, [],) : [],
            creator_notes: actor.creator_notes ?? "",
            creator: actor.creator ?? "",
            character_version: actor.character_version ?? "",
            tags,
            extensions: {},
          },
        };
        return jsonResponse(card,);
      },
      {
        params: ActorIdParams,
        response: {
          200: t.Any(),
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Get character card",
          description: "Get actor as a Chara Card v2 specification. Used for import/export compatibility.",
          tags: ["Characters",],
        },
      },
    );
}
