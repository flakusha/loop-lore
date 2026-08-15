/**
 * Character traits section — world and location traits for the current actor.
 * Provides environmental, cultural, and location-based context to the LLM.
 */
import { wrapSection, } from "../../xml-utils";
import type { AssembleContext, SectionBuilder, } from "../types";

export const characterTraitsSection: SectionBuilder = {
  name: "characterTraits",
  enabled: (ctx,) => !!ctx.chat.world_id || !!ctx.chat.current_location_id,
  build: async (ctx,) => {
    const parts: string[] = [];
    if (ctx.chat.world_id) {
      const worldParts = await buildWorldTraitParts(ctx,);
      parts.push(...worldParts,);
    }
    if (ctx.chat.current_location_id) {
      const locationParts = await buildLocationTraitParts(ctx,);
      parts.push(...locationParts,);
    }

    if (parts.length === 0) { return []; }
    return [{ role: "system", content: wrapSection("characterTraits", parts.join("\n",),), },];
  },
};

/** Build `[category] trait, trait…` lines from the actor's world traits. */
async function buildWorldTraitParts(ctx: AssembleContext,): Promise<string[]> {
  const { actor, } = ctx;
  const worldTraits = await ctx.db
    .selectFrom("character_world_traits",)
    .select(["trait_category", "trait_name", "trait_value",],)
    .where("actor_id", "=", actor.id,)
    .where("world_id", "=", ctx.chat.world_id!,)
    .orderBy("trait_category", "asc",)
    .execute();

  const parts: string[] = [];
  if (worldTraits.length === 0) { return parts; }

  const grouped = Object.groupBy(worldTraits, (t,) => t.trait_category,);
  for (const [cat, traits,] of Object.entries(grouped,)) {
    if (!traits) { continue; }
    const lines: string[] = Array.from(traits, (t,) => `${t.trait_name}: ${t.trait_value}`,);
    parts.push(`[${cat}] ${lines.join(", ",)}`,);
  }
  return parts;
}

/** Build `[location] trait (+bonus/-penalty); …` lines from location traits. */
async function buildLocationTraitParts(ctx: AssembleContext,): Promise<string[]> {
  const { actor, } = ctx;
  const locationTraits = await ctx.db
    .selectFrom("character_location_traits",)
    .select(["trait_name", "trait_value", "bonus", "penalty",],)
    .where("actor_id", "=", actor.id,)
    .where("location_id", "=", ctx.chat.current_location_id!,)
    .execute();

  const parts: string[] = [];
  if (locationTraits.length === 0) { return parts; }

  const lines: string[] = [];
  for (const t of locationTraits) {
    const mods: string[] = [];
    if (t.bonus && t.bonus > 0) { mods.push(`+${t.bonus}`,); }
    if (t.penalty && t.penalty > 0) { mods.push(`-${t.penalty}`,); }
    const mod = mods.length > 0 ? ` (${mods.join("/",)})` : "";
    lines.push(`${t.trait_name}: ${t.trait_value}${mod}`,);
  }
  parts.push(`[location] ${lines.join("; ",)}`,);
  return parts;
}
