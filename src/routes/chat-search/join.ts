// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { ChatParticipantRole, } from "../../db/enums";
import { WorldVisibility, } from "../../db/enums-story";
import { can, } from "../../users/permissions";
import { forbiddenResponse as forbidden, jsonCreated, jsonError, requireUserId, } from "../http-utils";
import { log, } from "./log";
import type { HandlerOpts, } from "./types";

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

          return jsonCreated({ chatId, joined: true, },);
        },
        {
          params: t.Object({ id: t.String({ format: "uuid", },), },),
        },
      )
  );
}
