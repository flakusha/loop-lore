import "./characters-update";
import { ActorType, } from "../../db/enums";
import { type CommandResult, registerCommand, } from "./registry";

const CARD_FIELDS = [
  "id",
  "display_name",
  "agent_type",
  "description",
  "personality",
  "appearance",
  "default_outfit",
  "scenario",
  "character_version",
] as const;

registerCommand("char-list", async (_args, ctx,): Promise<CommandResult> => {
  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Characters unavailable:** command context missing database.", handled: true, };
  }

  const userId = ctx.userId;
  if (!userId) {
    return { systemMessage: "**Characters unavailable:** command context has no user.", handled: true, };
  }

  const rows = await db
    .selectFrom("actors",)
    .select(["id", "display_name", "agent_type", "description",],)
    .where("owner_id", "=", userId,)
    .where("actor_type", "=", ActorType.Character,)
    .orderBy("display_name", "asc",)
    .execute();

  if (rows.length === 0) {
    return { systemMessage: "You own no characters yet.", handled: true, };
  }

  const list = rows.map((a,) => {
    const excerpt = a.description ? ` — ${a.description.slice(0, 80,)}` : "";
    return `- **${a.display_name}** (${a.agent_type})${excerpt} [${a.id}]`;
  },).join("\n",);

  return {
    systemMessage: `**Your characters (${rows.length}):**\n\n${list}`,
    action: "char-list",
    actionPayload: { characters: rows, },
    handled: true,
  };
}, { requiredRole: "member", },);

registerCommand("char-get", async (args, ctx,): Promise<CommandResult> => {
  const charId = args[0];
  if (!charId) {
    return { systemMessage: "Usage: /char-get <char-id>", handled: true, };
  }

  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Characters unavailable:** command context missing database.", handled: true, };
  }

  const userId = ctx.userId;
  if (!userId) {
    return { systemMessage: "**Characters unavailable:** command context has no user.", handled: true, };
  }

  // Ownership is a WHERE clause, not a post-fetch comparison: another user's
  // character is never fetched into this process at all, so there is no row to
  // leak even if a later branch were to get the wording wrong. `!card` alone
  // covers "missing", "not a character", and "not yours" alike.
  const card = await db
    .selectFrom("actors",)
    .select(CARD_FIELDS,)
    .where("id", "=", charId,)
    .where("actor_type", "=", ActorType.Character,)
    .where("owner_id", "=", userId,)
    .executeTakeFirst();

  if (!card) {
    return { systemMessage: `Character ${charId} not found or access denied.`, handled: true, };
  }

  const stats = await db
    .selectFrom("character_stats",)
    .select(["level", "hp", "max_hp", "ac", "speed", "str", "dex", "con", "int", "wis", "cha",],)
    .where("actor_id", "=", charId,)
    .executeTakeFirst();

  const lore = await db
    .selectFrom("actor_lore_entries",)
    .select(["id", "name",],)
    .where("actor_id", "=", charId,)
    .orderBy("name", "asc",)
    .execute();

  const statStr = stats
    ? `level ${stats.level} · HP ${stats.hp}/${stats.max_hp} · AC ${stats.ac} · spd ${stats.speed} · ` +
      `STR ${stats.str} DEX ${stats.dex} CON ${stats.con} INT ${stats.int} WIS ${stats.wis} CHA ${stats.cha}`
    : "_none_";

  const loreList = lore.length === 0
    ? "_none_"
    : lore.map((l,) => `- ${l.name ?? "(untitled)"} [${l.id}]`).join("\n",);

  return {
    systemMessage: [
      `**Character:** ${card.display_name} [${charId}]`,
      `**Agent type:** ${card.agent_type}`,
      card.character_version ? `**Version:** ${card.character_version}` : "",
      card.description ? `**Description:** ${card.description}` : "",
      card.personality ? `**Personality:** ${card.personality}` : "",
      card.appearance ? `**Appearance:** ${card.appearance}` : "",
      card.default_outfit ? `**Default outfit:** ${card.default_outfit}` : "",
      card.scenario ? `**Scenario:** ${card.scenario}` : "",
      `**Stats:** ${statStr}`,
      `**Lore entries (${lore.length}):**\n${loreList}`,
    ].filter(Boolean,).join("\n",),
    action: "char-get",
    actionPayload: { character: card, stats, lore, },
    handled: true,
  };
}, { requiredRole: "member", },);

/**
 * String fields `/char-update` accepts, keyed exactly as the user writes them.
 * They map onto the camelCase body `buildActorUpdates`
 * (`src/routes/characters/update.ts`) reads from the `PUT /api/v1/actors/:actorId`
 * request.
 */
const CHAR_UPDATE_STRING_FIELDS = [
  "displayName",
  "description",
  "systemPrompt",
  "agentRole",
  "avatarAssetId",
  "contentRating",
  "personality",
  "appearance",
  "defaultOutfit",
  "welcomeMessage",
  "mesExample",
  "scenario",
  "postHistoryInstructions",
  "creatorNotes",
  "creator",
  "characterVersion",
  "growthMode",
] as const;

/** Numeric fields `/char-update` accepts. */
const CHAR_UPDATE_NUMBER_FIELDS = ["avatarFocusX", "avatarFocusY",] as const;
/** Boolean fields `/char-update` accepts. */
const CHAR_UPDATE_BOOLEAN_FIELDS = ["llmAssistEnabled",] as const;
/** Every accepted field, for unknown-field error messages. */
const ALL_CHAR_UPDATE_FIELDS = [
  ...CHAR_UPDATE_STRING_FIELDS,
  ...CHAR_UPDATE_NUMBER_FIELDS,
  ...CHAR_UPDATE_BOOLEAN_FIELDS,
] as const;

/**
 * One `key=value` pair parsed out of a `/char-update` argument list.
 */
export type CharacterUpdatePatch = Partial<
  Record<
    (typeof CHAR_UPDATE_STRING_FIELDS | typeof CHAR_UPDATE_NUMBER_FIELDS | typeof CHAR_UPDATE_BOOLEAN_FIELDS)[number],
    string | number | boolean
  >
>;

export type ParseCharacterUpdatesResult =
  | { ok: true; updates: CharacterUpdatePatch }
  | { ok: false; error: string };

/**
 * Parse `key=value` update pairs from the text after the character id. Values
 * may be quoted to include spaces; unquoted values end at whitespace. Tokens
 * that are not `key=value` pairs are ignored. A repeated key is LAST-WINS: the
 * final pair overwrites earlier ones in the returned patch.
 * @param input - raw argument text after the character id
 * @returns ok with the allowed-field patch, or an error describing the first bad pair
 */
export function parseCharacterUpdates(input: string,): ParseCharacterUpdatesResult {
  const pairRe = /([a-zA-Z]+)\s*=\s*("([^"]*)"|'([^']*)'|(\S+))/g;
  const updates: CharacterUpdatePatch = {};
  let matched = false;

  for (const match of input.matchAll(pairRe,)) {
    matched = true;
    const key = match[1] ?? "";
    const value = match[3] ?? match[4] ?? match[5] ?? "";

    if ((CHAR_UPDATE_STRING_FIELDS as readonly string[]).includes(key,)) {
      updates[key as keyof CharacterUpdatePatch] = value;
      continue;
    }

    if ((CHAR_UPDATE_NUMBER_FIELDS as readonly string[]).includes(key,)) {
      const num = Number(value,);
      if (!Number.isFinite(num,)) {
        return { ok: false, error: `Field "${key}" expects a number, got "${value}".`, };
      }

      updates[key as keyof CharacterUpdatePatch] = num;
      continue;
    }

    if ((CHAR_UPDATE_BOOLEAN_FIELDS as readonly string[]).includes(key,)) {
      if (value !== "true" && value !== "false") {
        return { ok: false, error: `Field "${key}" expects true or false, got "${value}".`, };
      }

      updates[key as keyof CharacterUpdatePatch] = value === "true";
      continue;
    }

    return {
      ok: false,
      error: `Unknown character field "${key}" — allowed: ${ALL_CHAR_UPDATE_FIELDS.join(", ",)}.`,
    };
  }

  if (!matched) {
    return {
      ok: false,
      error: 'No updates parsed — use key=value pairs, e.g. displayName="Iria the Bold".',
    };
  }

  return { ok: true, updates, };
}
