// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat backgrounds — catalog sub-plugin (list/create background assets).
 */
import { Elysia, t, } from "elysia";
import { uid, } from "../../utils";
import { ErrorResponse, } from "../../validation/schemas";
import { jsonResponse, requireUserId, } from "../http-utils";
import { BACKGROUND_TYPES, ChatBackgroundCreateBody, } from "./shared";
import type { HandlerOpts, } from "./types";

export function catalogRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chat-backgrounds-catalog", },)
      .get(
        `${prefix}/backgrounds`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const backgrounds = await database.selectFrom("chat_backgrounds",).selectAll().orderBy("name", "asc",)
            .execute();
          return jsonResponse({ data: backgrounds, },);
        },
        {
          response: {
            200: t.Any(),
            401: ErrorResponse,
          },
          detail: {
            summary: "List chat backgrounds",
            description: "List all background assets in the catalog.",
            tags: ["Chats", "Backgrounds",],
          },
        },
      )
      .post(
        `${prefix}/backgrounds`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const body = ctx.body as {
            name: string;
            type?: string;
            locationId?: string | null;
            assetId?: string | null;
            config?: string | null;
            priority?: number | null;
          };
          const name = (body.name ?? "").trim();
          if (!name) { return jsonResponse({ error: "name is required", }, 400,); }
          if (body.type && !BACKGROUND_TYPES.includes(body.type,)) {
            return jsonResponse({ error: `type must be one of: ${BACKGROUND_TYPES.join(", ",)}`, }, 400,);
          }

          const id = uid();
          await database
            .insertInto("chat_backgrounds",)
            .values({
              id,
              name,
              type: body.type ?? "static",
              location_id: body.locationId ?? null,
              asset_id: body.assetId ?? null,
              config: body.config ?? null,
              priority: body.priority ?? 0,
            },)
            .execute();

          return jsonResponse({ id, }, 201,);
        },
        {
          body: ChatBackgroundCreateBody,
          response: {
            201: t.Object({ id: t.String(), },),
            400: ErrorResponse,
            401: ErrorResponse,
          },
          detail: {
            summary: "Create chat background",
            description: "Create a background asset, optionally scoped to a location.",
            tags: ["Chats", "Backgrounds",],
          },
        },
      )
  );
}
