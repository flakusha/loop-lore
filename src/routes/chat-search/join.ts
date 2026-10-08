// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { getLocationHistory, } from "../../chat/service";
import { ChatParticipantRole, } from "../../db/enums";
import { WorldVisibility, } from "../../db/enums-story";
import { can, } from "../../users/permissions";
import { forbiddenResponse as forbidden, jsonCreated, jsonError, requireUserId, } from "../http-utils";
import { log, } from "./log";
import type { HandlerOpts, } from "./types";

/**
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { chats: { ":id": { join: { ...; }; }; }; }; }, { ...; }, { ...; }>}
 */
export function joinRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chat-search-join", },)
      // ── Join a chat ──────────────────────────────────────────
      .post(
        `${prefix}/chats/:id/join`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          const chatId = (ctx.params as { id: string }).id;

          // Check chat exists and is world-linked (joinable)
          const chatWorld = await database
            .selectFrom("chats",)
            .select("world_id",)
            .where("id", "=", chatId,)
            .executeTakeFirst();

          if (!chatWorld?.world_id) {
            return jsonError({ message: "Chat is not joinable — no world assigned", status: 400, },);
          }

          // Check user can access the chat's world (owner/admin, public, or world member)
          const world = await database
            .selectFrom("worlds",)
            .select(["owner_id", "visibility",],)
            .where("id", "=", chatWorld.world_id,)
            .executeTakeFirst();

          const userRole = ctx.userRole as string | null;
          const isOwnerOrAdmin = world !== undefined &&
            (world.owner_id === userId || can(userRole, "admin.chat",));

          const isPublicWorld = world?.visibility === WorldVisibility.Public;
          if (!isOwnerOrAdmin && !isPublicWorld) {
            const member = await database
              .selectFrom("world_members",)
              .select("actor_id",)
              .where("world_id", "=", chatWorld.world_id,)
              .where("actor_id", "=", userId,)
              .executeTakeFirst();

            if (!member) {
              return forbidden("You are not a member of this world",);
            }
          }

          // Check user is not already a participant
          const existing = await database
            .selectFrom("chat_participants",)
            .select("chat_id",)
            .where("chat_id", "=", chatId,)
            .where("actor_id", "=", userId,)
            .executeTakeFirst();

          if (existing) {
            return jsonError({ message: "Already a participant in this chat", status: 400, },);
          }

          // Add user as participant
          await database
            .insertInto("chat_participants",)
            .values({
              chat_id: chatId,
              actor_id: userId,
              role_in_chat: ChatParticipantRole.Member,
              joined_at: new Date().toISOString(),
            },)
            .execute();

          log().info("User joined chat", { chatId, userId, },);

          const chat = await database
            .selectFrom("chats",)
            .select(["name", "current_location_id", "world_id",],)
            .where("id", "=", chatId,)
            .executeTakeFirst();

          let location: { id: string; name: string } | null = null;

          if (chat?.current_location_id) {
            const row = await database
              .selectFrom("locations",)
              .select(["id", "name",],)
              .where("id", "=", chat.current_location_id,)
              .where("world_id", "=", chat.world_id,)
              .executeTakeFirst();

            if (row) {
              location = { id: row.id, name: row.name, };
            }
          }

          let recentLocationEvents: Array<{
            id: string;
            fromLocationId: string | null;
            toLocationId: string | null;
            sectionId: string | null;
            source: string;
            createdAt: string;
          }> = [];

          if (location) {
            try {
              const history = await getLocationHistory(database, chatId,);

              recentLocationEvents = history.slice(-10,).map((event,) => ({
                id: event.id,
                fromLocationId: event.fromLocationId,
                toLocationId: event.toLocationId,
                sectionId: event.sectionId,
                source: event.source,
                createdAt: event.createdAt,
              }));
            } catch {
              recentLocationEvents = [];
            }
          }

          return jsonCreated({
            chatId,
            joined: true,
            chatTitle: chat?.name ?? null,
            location,
            recentLocationEvents,
          },);
        },
        {
          params: t.Object({ id: t.String({ format: "uuid", },), },),
        },
      )
  );
}
