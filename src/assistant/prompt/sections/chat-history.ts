/**
 * Chat history section — recent confirmed, visible messages, sliced to the
 * token budget (approx 4 chars per token).
 *
 * Decrypts encrypted message bodies before feeding them to the LLM so prior
 * turns never reach the prompt as ciphertext (a data-leak + prompt-quality bug).
 */
import { decryptMessageContent, getSmk, } from "../../../crypto";
import { MessageRole, MessageStatus, MessageVisibility, } from "../../../db/enums";
import type { GenerationMessage, } from "../../../generation/gen-types-options";
import type { SectionBuilder, } from "../types";

export const chatHistorySection: SectionBuilder = {
  name: "chatHistory",
  enabled: () => true,
  build: async (ctx,) => {
    const maxMessages = Math.floor(ctx.tokenBudget / 4,);
    const rows = await ctx.db
      .selectFrom("messages",)
      .select(["role", "content", "content_encoding", "key_id", "actor_id",],)
      .where("chat_id", "=", ctx.params.chatId,)
      .where("status", "=", MessageStatus.Confirmed,)
      .where("visibility", "=", MessageVisibility.Visible,)
      .where("role", "in", [
        MessageRole.User,
        MessageRole.Assistant,
        MessageRole.Character,
        MessageRole.System,
      ],)
      .orderBy("created_at", "asc",)
      .limit(maxMessages,)
      .execute();

    const smk = getSmk();
    const chatId = ctx.params.chatId;
    const out: GenerationMessage[] = [];
    for (const row of rows) {
      let content = row.content;
      if (row.key_id && smk) {
        try {
          content = await decryptMessageContent(ctx.db, { ...row, chat_id: chatId, }, smk,);
        } catch {
          // A corrupt/tampered payload in history must not break the whole
          // prompt — surface a placeholder rather than the raw ciphertext.
          content = "[encrypted message unavailable]";
        }
      }
      out.push({ role: row.role, content, },);
    }
    return out;
  },
};
