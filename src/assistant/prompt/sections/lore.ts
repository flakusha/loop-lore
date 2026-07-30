/**
 * Lore section — actor and world lore entries. Constant and non-selective
 * entries are always included; selective entries only when one of their keys
 * appears in the most recent user message. Entries with active cooldowns
 * are excluded until the cooldown expires.
 */
import { wrapSection, } from "../../xml-utils";
import { parseKeywords, recentUserWords, } from "../keywords";
import type { SectionBuilder, } from "../types";

/** Check if a lore entry's cooldown has expired. */
function isCooldownExpired(
  lastActivated: string | null,
  cooldownSeconds: number,
): boolean {
  if (cooldownSeconds <= 0) { return true; }
  if (!lastActivated) { return true; }
  const lastActivatedMs = new Date(lastActivated,).getTime();
  const cooldownMs = cooldownSeconds * 1000;
  return Date.now() - lastActivatedMs >= cooldownMs;
}

export const loreSection: SectionBuilder = {
  name: "lore",
  enabled: (ctx,) => ctx.params.includeLore !== false,
  build: async (ctx,) => {
    const { actor, chat, params, } = ctx;

    const [actorLore, worldLore,] = await Promise.all([
      ctx.db
        .selectFrom("actor_lore_entries",)
        .select(["content", "keys", "position", "constant", "selective", "cooldown_seconds", "last_activated", "id",],)
        .where("actor_id", "=", actor.id,)
        .where("enabled", "=", "enabled",)
        .orderBy("position", "asc",)
        .execute(),
      chat.world_id
        ? ctx.db
          .selectFrom("world_lore_entries",)
          .select([
            "content",
            "keys",
            "position",
            "constant",
            "selective",
            "cooldown_seconds",
            "last_activated",
            "id",
          ],)
          .where("world_id", "=", chat.world_id,)
          .where("enabled", "=", "enabled",)
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
      cooldown_seconds: number;
      last_activated: string | null;
    },): boolean => {
      // Check cooldown first
      if (!isCooldownExpired(entry.last_activated, entry.cooldown_seconds,)) {
        return false;
      }
      if (entry.constant) { return true; }
      if (!entry.selective) { return true; }
      const keys = parseKeywords(entry.keys,);
      if (keys.length === 0) { return true; }
      return keys.some((k,) => contextWords.has(k.toLowerCase(),));
    };

    const relevantEntries = [...actorLore, ...worldLore,].filter((entry,) => isRelevant(entry,));

    // Update last_activated for entries that were included
    const now = new Date().toISOString();
    for (const entry of relevantEntries) {
      if (entry.cooldown_seconds > 0) {
        // Try actor_lore_entries first
        const actorResult = await ctx.db
          .updateTable("actor_lore_entries",)
          .set({ last_activated: now, },)
          .where("id", "=", entry.id,)
          .executeTakeFirst();

        // If no rows affected, try world_lore_entries
        if (Number(actorResult.numUpdatedRows,) === 0) {
          void ctx.db
            .updateTable("world_lore_entries",)
            .set({ last_activated: now, },)
            .where("id", "=", entry.id,)
            .execute()
            .catch(() => {
              // Ignore errors - cooldown tracking is non-critical
            },);
        }
      }
    }

    const loreText = relevantEntries.map((e,) => e.content).join("\n\n",);

    return loreText ? [{ role: "system", content: wrapSection("lore", loreText,), },] : [];
  },
};
