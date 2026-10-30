// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /char-list, /char-get — assistant access to the caller's own characters.
 *
 * Characters have no world scope: the authoritative guard is `actors.owner_id`.
 * The reads deliberately do NOT inherit the route's `admin.character` branch:
 * `ctx.userRole` now exists but is unused there, and ownership stays a WHERE
 * clause so another user's row is never fetched into this process. Narrower
 * than the route, on purpose. `/char-update` lives in `./characters-update`,
 * which also owns the `/char-update` argument parser.
 */

import { ActorType, } from "../../db/enums";
import { parseCharacterUpdates, } from "./characters-update";
import { type CommandResult, registerCommand, } from "./registry";

// `parseCharacterUpdates` moved to `./characters-update`, the module that owns
// `/char-update`. It is re-exported here so existing importers keep working,
// and the import keeps `/char-update` registering before `/char-list` and
// `/char-get` — the order the frozen command vectors expect.
export { parseCharacterUpdates, };

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
    handled: true,
  };
}, { requiredRole: "member", capabilities: ["read-character",], },);

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
    handled: true,
  };
}, { requiredRole: "member", capabilities: ["read-character", "read-lore",], },);
