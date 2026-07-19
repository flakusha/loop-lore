/**
 * Memory section — the actor's most important memories, keyword-filtered
 * against the latest user message for relevance.
 */
import { wrapSection, } from "../../xml-utils";
import { parseKeywords, recentUserWords, } from "../keywords";
import type { SectionBuilder, } from "../types";

export const memorySection: SectionBuilder = {
  name: "memories",
  enabled: () => true,
  build: async (ctx,) => {
    const memories = await ctx.db
      .selectFrom("actor_memories",)
      .select(["content", "memory_type", "importance", "keywords",],)
      .where("actor_id", "=", ctx.actor.id,)
      .orderBy("importance", "desc",)
      .limit(20,)
      .execute();

    if (memories.length === 0) { return []; }

    const contextWords = await recentUserWords(ctx.db, ctx.params.chatId,);
    const relevant = memories.filter((m,) => {
      const keys = parseKeywords(m.keywords,);
      if (keys.length === 0) { return true; }
      return keys.some((k,) => contextWords.has(k.toLowerCase(),));
    },);

    if (relevant.length === 0) { return []; }

    const memoryText = relevant.map((m,) => `- [${m.memory_type}] ${m.content}`).join("\n",);

    // XML delimiting with per-session nonce prevents injected memories from being
    // mistaken for instructions by the model.
    return [{ role: "system", content: wrapSection("memory_context", memoryText,), },];
  },
};
