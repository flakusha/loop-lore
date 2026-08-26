// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat history section — recent confirmed, visible messages, sliced to the
 * token budget (approx 4 chars per token).
 *
 * Decrypts encrypted message bodies before feeding them to the LLM so prior
 * turns never reach the prompt as ciphertext (a data-leak + prompt-quality bug).
 */
import { MessageRole, MessageStatus, MessageVisibility, } from "../../../db/enums";
import type { GenerationMessage, } from "../../../generation/gen-types-options";
import { resolveMessageContent, } from "../../../routes/messages/helpers";
import type { SectionBuilder, } from "../types";

export const chatHistorySection: SectionBuilder = {
  name: "chatHistory",
  enabled: () => true,
  build: async (ctx,) => {
    const maxMessages = Math.floor(ctx.tokenBudget / 4,);
    const rows = await ctx.db
      .selectFrom("messages",)
      // NOTE: "thinking" column intentionally excluded — LLM reasoning is
      // already distilled into the answer. Including raw thinking wastes
      // context budget (2-5× answer length) with no proven benefit.
      // If a use case emerges (e.g. chain-of-thought continuity), add a
      // chat-level toggle and include "thinking" here conditionally:
      //
      //   .select(["role", "content", "content_encoding", "key_id", "actor_id",
      //     ...(ctx.params.includeThinking ? ["thinking" as const] : [])])
      //
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

    const chatId = ctx.params.chatId;
    const out: GenerationMessage[] = [];
    for (const row of rows) {
      let content: string;
      try {
        // resolveMessageContent handles three cases that prior code missed:
        //   1. encrypted (key_id set) → decrypt via tier-aware at-rest layer
        //   2. gzip-stored plaintext (key_id null, encoding gzip) → decompress
        //   3. identity plaintext → pass through
        // The previous inline check only handled (1); rows >10KB stored as
        // gzip leaked raw base64 into the prompt (a privacy + token-cost bug).
        content = await resolveMessageContent(ctx.db, { ...row, chat_id: chatId, },);
      } catch {
        // A corrupt/tampered payload in history must not break the whole
        // prompt — surface a placeholder rather than the raw payload.
        content = "[encrypted message unavailable]";
      }
      out.push({ role: row.role, content, },);
    }
    return out;
  },
};
