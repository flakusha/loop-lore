/**
 * Chat history section — recent confirmed, visible messages, sliced to the
 * token budget (approx 4 chars per token).
 */
import type { SectionBuilder } from "../types";
import { MessageRole, MessageStatus, MessageVisibility } from "../../../db/enums";

export const chatHistorySection: SectionBuilder = {
  name: "chatHistory",
  enabled: () => true,
  build: async (ctx) => {
    const maxMessages = Math.floor(ctx.tokenBudget / 4);
    const rows = await ctx.db
      .selectFrom("messages")
      .select(["role", "content", "actor_id"])
      .where("chat_id", "=", ctx.params.chatId)
      .where("status", "=", MessageStatus.Confirmed)
      .where("visibility", "=", MessageVisibility.Visible)
      .where("role", "in", [
        MessageRole.User,
        MessageRole.Assistant,
        MessageRole.Character,
        MessageRole.System,
      ])
      .orderBy("created_at", "asc")
      .limit(maxMessages)
      .execute();

    return rows.map((row) => ({
      role: row.role,
      content: row.content,
    }));
  },
};
