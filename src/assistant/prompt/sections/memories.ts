/**
 * Memory section — the actor's most important memories, keyword-filtered
 * against the latest user message for relevance.
 */
import type { SectionBuilder } from "../types";
import { parseKeywords, recentUserWords } from "../keywords";

export const memorySection: SectionBuilder = {
  name: "memories",
  enabled: () => true,
  build: async (ctx) => {
    const memories = await ctx.db
      .selectFrom("actor_memories")
      .select(["content", "memory_type", "importance", "keywords"])
      .where("actor_id", "=", ctx.actor.id)
      .orderBy("importance", "desc")
      .limit(20)
      .execute();

    if (memories.length === 0) return [];

    const contextWords = await recentUserWords(ctx.db, ctx.params.chatId);
    const relevant = memories.filter((m) => {
      const keys = parseKeywords(m.keywords);
      if (keys.length === 0) return true;
      return keys.some((k) => contextWords.has(k.toLowerCase()));
    });

    if (relevant.length === 0) return [];

    const memoryText = relevant.map((m) => `- [${m.memory_type}] ${m.content}`).join("\n");

    // XML delimiting prevents injected memories from being mistaken for
    // instructions by the model.
    return [{ role: "system", content: `<memory_context>\n${memoryText}\n</memory_context>` }];
  },
};
