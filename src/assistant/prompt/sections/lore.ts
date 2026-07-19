/**
 * Lore section — actor and world lore entries. Constant and non-selective
 * entries are always included; selective entries only when one of their keys
 * appears in the most recent user message.
 */
import { wrapSection, } from "../../xml-utils";
import { parseKeywords, recentUserWords, } from "../keywords";
import type { SectionBuilder, } from "../types";

export const loreSection: SectionBuilder = {
  name: "lore",
  enabled: (ctx,) => ctx.params.includeLore !== false,
  build: async (ctx,) => {
    const { actor, chat, params, } = ctx;

    const [actorLore, worldLore,] = await Promise.all([
      ctx.db
        .selectFrom("actor_lore_entries",)
        .select(["content", "keys", "position", "constant", "selective",],)
        .where("actor_id", "=", actor.id,)
        .orderBy("position", "asc",)
        .execute(),
      chat.world_id
        ? ctx.db
          .selectFrom("world_lore_entries",)
          .select(["content", "keys", "position", "constant", "selective",],)
          .where("world_id", "=", chat.world_id,)
          .orderBy("position", "asc",)
          .execute()
        : Promise.resolve([],),
    ],);

    const contextWords = params.selectiveKeys
      ? new Set(params.selectiveKeys.map((k,) => k.toLowerCase()),)
      : await recentUserWords(ctx.db, params.chatId,);
    const isRelevant = (entry: {
      content: string;
      keys: unknown;
      constant: number | boolean;
      selective: number | boolean;
    },): boolean => {
      if (entry.constant) { return true; }
      if (!entry.selective) { return true; }
      const keys = parseKeywords(entry.keys,);
      if (keys.length === 0) { return true; }
      return keys.some((k,) => contextWords.has(k.toLowerCase(),));
    };

    const relevantEntries = [...actorLore, ...worldLore,].filter((entry,) => isRelevant(entry,));
    const loreText = relevantEntries.map((e,) => e.content).join("\n\n",);

    return loreText ? [{ role: "system", content: wrapSection("lore", loreText,), },] : [];
  },
};
