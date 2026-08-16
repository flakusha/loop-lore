// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { unauthorized, } from "../../validation/middleware";
import { ErrorResponse, } from "../../validation/schemas";
import { extractAuth, jsonResponse, } from "../http-utils";
import { requireWorldAccess, } from "./access";
import type { HandleOpts, } from "./types";

/**
 * List chats in a world the user participates in, optionally filtered by
 * location — the grouped enumeration that powers the world channel tree.
 * In a chat-only world, `chats.current_location_id` is the static channel
 * binding; the frontend groups the returned rows by location.
 */
async function handleListWorldChats(
  database: Kysely<DB>,
  worldId: string,
  userId: string | null,
  userRole: string | null,
  locationId: string | null,
) {
  const worldErr = await requireWorldAccess(database, worldId, userId, userRole,);
  if (worldErr) { return worldErr; }
  if (!userId) { return unauthorized(); }

  let query = database
    .selectFrom("chats",)
    .leftJoin("locations", "locations.id", "chats.current_location_id",)
    .select([
      "chats.id",
      "chats.name",
      "chats.current_location_id",
      "chats.updated_at",
      "locations.name as location_name",
    ],)
    .where("chats.world_id", "=", worldId,)
    .where("chats.is_pinned", "!=", "archived",)
    .where(
      "chats.id",
      "in",
      database
        .selectFrom("chat_participants",)
        .select("chat_id",)
        .where("actor_id", "=", userId,),
    );

  if (locationId) {
    query = query.where("chats.current_location_id", "=", locationId,);
  }

  const chats = await query.orderBy("chats.updated_at", "desc",).execute();
  return jsonResponse({ data: chats, },);
}

export function chatsRoutes(opts: HandleOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "worlds-chats", },)
    .get(
      `${prefix}/worlds/:worldId/chats`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const locationId = (ctx.query?.locationId as string | undefined) ?? null;
        return handleListWorldChats(database, ctx.params.worldId as string, userId, userRole, locationId,);
      },
      {
        params: t.Object({ worldId: t.String(), },),
        query: t.Optional(t.Object({ locationId: t.Optional(t.String(),), },),),
        response: {
          200: t.Object({ data: t.Array(t.Any(),), },),
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "List world chats",
          description:
            "List chats in a world the user participates in, optionally filtered by location (world channel tree).",
          tags: ["Worlds", "Chats",],
        },
      },
    );
}
