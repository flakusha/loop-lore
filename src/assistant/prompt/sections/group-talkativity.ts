// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Group talkativity section — surfaces each actor's per-chat participation
 * weight (1-10) so the LLM knows who is "loud" vs "quiet" in a group chat.
 *
 * Selection frequency is already biased by TurnManager (consumes
 * `chat_participants.talkativity`), but the score was never emitted into
 * the per-actor system prompt. Without it, the LLM defaults to roughly
 * equal verbosity across characters (BUG-group-chat-talkativity-not-
 * surfaced-in-prompt).
 */
import type { SectionBuilder, } from "../types";

export const groupTalkativitySection: SectionBuilder = {
  name: "groupTalkativity",
  enabled: (ctx,) => !!(ctx.params.groupParticipantIds && ctx.params.groupParticipantIds.length > 0),
  build: async (ctx,) => {
    const ids = ctx.params.groupParticipantIds ?? [];
    if (ids.length === 0) { return []; }
    const rows = await ctx.db
      .selectFrom("chat_participants",)
      .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
      .select([
        "actors.id",
        "actors.display_name",
        "chat_participants.talkativity",
      ],)
      .where("chat_participants.chat_id", "=", ctx.params.chatId,)
      .where("actors.id", "in", ids,)
      .execute();
    if (rows.length === 0) { return []; }
    const lines = rows.map((r,) => {
      const name = r.display_name ?? r.id;
      const score = r.talkativity ?? 5;
      return `- ${name}: ${score}/10`;
    },);
    return [{
      role: "system",
      content: "[Group Talkativity]\n" +
        "Per-chat participation weight — higher score = more likely to speak, lower score = tends to stay quiet. " +
        "Keep response verbosity consistent with each character's talkativity when roleplaying their reply.\n" +
        lines.join("\n",),
    },];
  },
};
