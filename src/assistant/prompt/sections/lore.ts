/**
 * Lore section — actor and world lore entries. Constant and non-selective
 * entries are always included; selective entries only when one of their keys
 * appears in the most recent user message. Entries with active cooldowns
 * are excluded until the cooldown expires. Entries with an audience scope
 * (race/profession/location) are filtered by the speaking actor's identity.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { isLoreVisibleTo, parseLoreScope, } from "../../lore/audience";
import type { ActorIdentity, } from "../../lore/audience";
import { wrapSection, } from "../../xml-utils";
import { parseKeywords, recentUserWords, } from "../keywords";
import type { SectionBuilder, } from "../types";

/** Wealth of an actor's identity needed for audience scoping. */
interface LoreIdentityRow {
  trait_name: string;
  trait_value: string;
}

/** Row shape returned by the lore queries (used by relevance + audience filtering). */
interface LoreRow {
  content: string;
  keys: unknown;
  position: unknown;
  constant: number | boolean;
  selective: number | boolean;
  cooldown_seconds: number;
  last_activated: string | null;
  id: string;
  audience_scope: string | null;
}

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

/**
 * Resolve the speaking actor's identity (race + profession traits) for lore
 * audience scoping. Race = permanent trait `species`; profession = permanent
 * traits named `profession`/`class` plus `professions.discipline` rows.
 */
async function resolveActorIdentity(
  db: Kysely<DB>,
  actorId: string,
  worldId: string | null,
): Promise<ActorIdentity> {
  const [traitRows, professionRows,] = await Promise.all([
    db
      .selectFrom("character_permanent_traits",)
      .select(["trait_name", "trait_value",],)
      .where("actor_id", "=", actorId,)
      .execute(),
    worldId
      ? db
        .selectFrom("professions",)
        .select("discipline",)
        .where("actor_id", "=", actorId,)
        .where("world_id", "=", worldId,)
        .execute()
      : Promise.resolve([] as { discipline: string }[],),
  ],);

  const traits = traitRows as LoreIdentityRow[];
  const species = traits.find((t,) => t.trait_name === "species")?.trait_value ?? "human";
  const professions = new Set<string>();
  for (const t of traits) {
    if (t.trait_name === "profession" || t.trait_name === "class") {
      professions.add(t.trait_value,);
    }
  }
  for (const row of professionRows) {
    professions.add(row.discipline,);
  }

  return { race: species, professions: [...professions,], locationId: null, };
}

export const loreSection: SectionBuilder = {
  name: "lore",
  enabled: (ctx,) => ctx.params.includeLore !== false,
  build: async (ctx,) => {
    const { actor, chat, params, } = ctx;
    const locationId = chat.current_location_id ?? null;

    const [actorLore, worldLore, identity,] = await Promise.all([
      ctx.db
        .selectFrom("actor_lore_entries",)
        .select([
          "content",
          "keys",
          "position",
          "constant",
          "selective",
          "cooldown_seconds",
          "last_activated",
          "id",
          "audience_scope",
        ],)
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
            "audience_scope",
          ],)
          .where("world_id", "=", chat.world_id,)
          .where("enabled", "=", "enabled",)
          .orderBy("position", "asc",)
          .execute()
        : Promise.resolve([] as LoreRow[],),
      resolveActorIdentity(ctx.db, actor.id, chat.world_id,),
    ],);

    const identityWithLocation: ActorIdentity = { ...identity, locationId, };

    const contextWords = params.selectiveKeys
      ? new Set(params.selectiveKeys.map((k,) => k.toLowerCase()),)
      : await recentUserWords(ctx.db, params.chatId,);
    const isRelevant = (entry: LoreRow,): boolean => {
      // Audience gate first — forbidden lore is never considered for activation.
      if (!isLoreVisibleTo({ audienceScope: parseLoreScope(entry.audience_scope,), }, identityWithLocation,)) {
        return false;
      }
      // Check cooldown second
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
      if (entry.cooldown_seconds <= 0) { continue; }
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

    const loreText = relevantEntries.map((e,) => e.content).join("\n\n",);

    return loreText ? [{ role: "system", content: wrapSection("lore", loreText,), },] : [];
  },
};
