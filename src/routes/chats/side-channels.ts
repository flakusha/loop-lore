// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Side-channels for group chats (C1 — chat-type matrix UI remainder).
 *
 * A side-channel is a child chat linked to a parent group chat via
 * `chats.parent_chat_id`. It shares the parent's type/mode/owner/world and
 * participants, but has its own message tree — a private parallel discussion
 * that stays inside the group's context.
 *
 * Discriminator: side-channels carry `parent_chat_id` AND `template_id IS NULL`.
 * Migrated chats (POST /api/chats/:id/migrate) also set `parent_chat_id` but
 * always carry a `template_id`; both list and migrate-idempotency checks scope
 * on `template_id` so the two child kinds never collide.
 */
import { Elysia, t, } from "elysia";
import { checkChatAccess, createChat, } from "../../chat/service";
import { Name, } from "../../validation/schemas/primitives";
import { jsonCreated, jsonResponse, notFoundResponse as notFound, requireUserId, } from "../http-utils";
import type { HandlerOpts, } from "./types";

/** Body for `POST /api/chats/:id/side` — create a side-channel. */
const SideChannelCreateBody = t.Object({
  name: t.Optional(Name,),
},);

const ChatIdOnlyParams = t.Object({
  id: t.String({ minLength: 1, },),
},);

/**
 * Side-channel routes — create + list child chats for a group chat.
 * @param opts
 * @param prefix
 */
export function sideChannelRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chats-side-channels", },)
      // List side-channels of a chat (children with parent_chat_id set and
      // NO template — migrate children are excluded).
      .get(
        `${prefix}/chats/:id/side`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;

          const access = await checkChatAccess(database, id, userId, userRole,);
          if (!access.ok) { return notFound("Chat not found",); }

          const sideChannels = await database
            .selectFrom("chats",)
            .select([
              "id",
              "name",
              "type",
              "mode",
              "created_by",
              "world_id",
              "created_at",
              "updated_at",
            ],)
            .where("parent_chat_id", "=", id,)
            .where("template_id", "is", null,)
            .orderBy("created_at", "asc",)
            .execute();

          return jsonResponse({ sideChannels, },);
        },
        { params: ChatIdOnlyParams, },
      )
      // Create a side-channel: child chat inheriting parent type/mode/world/participants.
      .post(
        `${prefix}/chats/:id/side`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as { name?: string };

          const parent = await database
            .selectFrom("chats",)
            .select(["id", "name", "type", "mode", "created_by", "world_id", "current_location_id",],)
            .where("id", "=", id,)
            .executeTakeFirst();
          if (!parent) { return notFound("Chat not found",); }
          if (parent.created_by !== userId) { return notFound("Chat not found",); }

          const newChatId = await createChat(database, {
            name: body.name ?? `${parent.name} (side)`,
            type: parent.type,
            mode: parent.mode,
            createdBy: userId,
            worldId: parent.world_id,
            currentLocationId: parent.current_location_id,
            parentChatId: id,
          },);

          // Inherit parent participants (owner + members) so a side-channel
          // shares the group's cast. Owner is added by createChat; copy others.
          const members = await database
            .selectFrom("chat_participants",)
            .select("actor_id",)
            .where("chat_id", "=", id,)
            .where("role_in_chat", "!=", "owner",)
            .execute();
          for (const m of members) {
            try {
              await database
                .insertInto("chat_participants",)
                .values({ chat_id: newChatId, actor_id: m.actor_id, role_in_chat: "member", },)
                .execute();
            } catch {
              /* skip duplicate */
            }
          }

          return jsonCreated({ id: newChatId, },);
        },
        { params: ChatIdOnlyParams, body: SideChannelCreateBody, },
      )
  );
}
