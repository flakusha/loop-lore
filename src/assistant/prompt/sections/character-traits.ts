/**
 * Character traits section — world and location traits for the current actor.
 * Provides environmental, cultural, and location-based context to the LLM.
 */
import { wrapSection, } from "../../xml-utils";
import type { SectionBuilder, } from "../types";

export const characterTraitsSection: SectionBuilder = {
  name: "characterTraits",
  enabled: (ctx,) => !!ctx.chat.world_id || !!ctx.chat.current_location_id,
  build: async (ctx,) => {
    const { actor, } = ctx;
    const parts: string[] = [];

    if (ctx.chat.world_id) {
      const worldTraits = await ctx.db
        .selectFrom("character_world_traits",)
        .select(["trait_category", "trait_name", "trait_value",],)
        .where("actor_id", "=", actor.id,)
        .where("world_id", "=", ctx.chat.world_id,)
        .orderBy("trait_category", "asc",)
        .execute();

      if (worldTraits.length > 0) {
        const grouped = Object.groupBy(worldTraits, (t,) => t.trait_category,);
        for (const [cat, traits,] of Object.entries(grouped,)) {
          if (!traits) { continue; }
          const lines: string[] = [];
          for (const t of traits) { lines.push(`${t.trait_name}: ${t.trait_value}`,); }
          parts.push(`[${cat}] ${lines.join(", ",)}`,);
        }
      }
    }

    if (ctx.chat.current_location_id) {
      const locationTraits = await ctx.db
        .selectFrom("character_location_traits",)
        .select(["trait_name", "trait_value", "bonus", "penalty",],)
        .where("actor_id", "=", actor.id,)
        .where("location_id", "=", ctx.chat.current_location_id,)
        .execute();

      if (locationTraits.length > 0) {
        const lines: string[] = [];
        for (const t of locationTraits) {
          const mods: string[] = [];
          if (t.bonus && t.bonus > 0) { mods.push(`+${t.bonus}`,); }
          if (t.penalty && t.penalty > 0) { mods.push(`-${t.penalty}`,); }
          const mod = mods.length > 0 ? ` (${mods.join("/",)})` : "";
          lines.push(`${t.trait_name}: ${t.trait_value}${mod}`,);
        }
        parts.push(`[location] ${lines.join("; ",)}`,);
      }
    }

    if (parts.length === 0) { return []; }
    return [{ role: "system", content: wrapSection("characterTraits", parts.join("\n",),), },];
  },
};
