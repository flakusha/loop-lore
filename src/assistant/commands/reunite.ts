// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /reunite — merge a split branch chat back into this chat (C7).
 *
 *   /reunite <secondaryChatId>
 *
 * The secondary chat's messages are copied here in chronological order,
 * its participants are merged (deduplicated), and the secondary is
 * archived. `reuniteChats` requires the caller to own BOTH chats.
 *
 * Ownership: the service's `created_by === actorId` guard applies, with the
 * session user (`ctx.userId`) as the actor — never a client-supplied id.
 */
import { reuniteChats, } from "../../chat/service/split";
import { ChatParticipantRole, } from "../../db/enums";
import { type CommandResult, registerCommand, } from "./registry";

registerCommand("reunite", async (args, ctx,): Promise<CommandResult> => {
  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Reunite unavailable:** command context missing database.", handled: true, };
  }

  const userId = ctx.userId;
  if (!userId) {
    return { systemMessage: "**Reunite unavailable:** missing user context.", handled: true, };
  }

  const secondaryChatId = (args[0] ?? "").trim();
  if (!secondaryChatId) {
    return {
      systemMessage: "Usage: `/reunite <secondaryChatId>`",
      handled: true,
    };
  }

  const result = await reuniteChats(db, {
    primaryChatId: ctx.chatId,
    secondaryChatId,
    actorId: userId,
  },);

  if ("code" in result) {
    return { systemMessage: `**Reunite failed:** ${result.message}`, handled: true, };
  }

  const messages = result.mergedMessageCount === 1 ? "message" : "messages";
  return {
    systemMessage:
      `**Party reunited** — merged ${result.mergedMessageCount} ${messages} from \`${secondaryChatId}\` into this chat; the branch chat is archived.`,
    action: "party-reunited",
    actionPayload: {
      primaryChatId: ctx.chatId,
      secondaryChatId,
      mergedMessageCount: result.mergedMessageCount,
    },
    handled: true,
  };
}, { requiredRole: ChatParticipantRole.Owner, },);
