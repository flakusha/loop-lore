// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /battle-ish command shared helpers.
 *
 * Resolves chat participants into `Combatant`s for the battles service:
 * every non-calling participant actor that has a `character_stats` row joins
 * the roster (mirrors the /stats character-resolution model, generalized to
 * all participants). The calling user is the commander, not a combatant.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema.js";
import type { Combatant, } from "../../rpg/combat.js";
import {
  type BattleItemView,
  type BattleWithRoster,
  buildCombatant,
} from "../../rpg/service/battles.js";

/** */
export interface ResolvedRosterItem {
  combatant: Combatant;
  actorId: string;
  name: string;
}

/** Place a character on the player or enemy side of a battle. */
export const CombatAlignment = {
  Player: "player",
  Enemy: "enemy",
} as const;
/** */
export type CombatAlignment = (typeof CombatAlignment)[keyof typeof CombatAlignment];

/**
 * Resolve the combatant roster for a chat.
 *
 * Returns one combatant per non-calling participant actor that has a
 * `character_stats` row, keyed by actor id. Participants without stats (e.g.
 * human users, narrators) are skipped. A character whose
 * `character_stats.combat_alignment` is `enemy` becomes an NPC combatant, so
 * the battle engine can reach its defeat check.
 * @param db - Database handle
 * @param chatId - Chat whose participants to resolve
 * @param callerActorId - The calling actor (excluded from the roster)
 * @returns The resolved combatants with their actor ids
 */
export async function resolveBattleRoster(
  db: Kysely<DB>,
  chatId: string,
  callerActorId: string,
): Promise<ResolvedRosterItem[]> {
  const participants = await db
    .selectFrom("chat_participants",)
    .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
    .innerJoin("character_stats", "character_stats.actor_id", "actors.id",)
    .where("chat_participants.chat_id", "=", chatId,)
    .where("chat_participants.actor_id", "!=", callerActorId,)
    .select([
      "actors.id",
      "actors.display_name",
      "character_stats.level",
      "character_stats.hp",
      "character_stats.max_hp",
      "character_stats.ac",
      "character_stats.str",
      "character_stats.dex",
      "character_stats.con",
      "character_stats.int",
      "character_stats.wis",
      "character_stats.cha",
      "character_stats.combat_alignment",
    ],)
    .execute();

  return Array.from(participants, (p,) => ({
    actorId: p.id,
    name: p.display_name,
    combatant: buildCombatant(
      p.id,
      p.display_name,
      { str: p.str, dex: p.dex, con: p.con, int: p.int, wis: p.wis, cha: p.cha, },
      p.level,
      p.hp,
      p.ac,
      p.combat_alignment === CombatAlignment.Enemy,
    ),
  }),);
}

/**
 * Find a combatant in a battle roster by a loose name/id match.
 * @param combatants - The active battle's combatant roster
 * @param needle - The user-supplied target (name or id, case-insensitive)
 * @returns The matching combatant, or null
 */
export function findCombatant(
  combatants: Combatant[],
  needle: string,
): Combatant | null {
  const lower = needle.trim().toLowerCase();
  for (const c of combatants) {
    if (c.id.toLowerCase() === lower || c.name.toLowerCase().includes(lower,)) {
      return c;
    }
  }

  return null;
}

/**
 * Join combatant names into a readable roster hint.
 * @param combatants - The roster
 * @returns A comma-joined name list, or "none" when empty
 */
export function formatRosterNames(combatants: { name: string }[],): string {
  if (combatants.length === 0) { return "none"; }
  return Array.from(combatants, (c,) => c.name,).join(", ",);
}

/**
 * Render a battle as a readable markdown block.
 * @param battle - The battle to format
 * @returns A markdown roster block
 */
export function formatBattle(battle: BattleWithRoster,): string {
  const acting = battle.combatants[battle.turnIndex];
  const lines = [
    `**Battle — Round ${battle.round}** (${battle.status})`,
    "",
  ];

  for (const c of battle.combatants) {
    const marker = c.id === acting?.id ? "➤ " : "  ";
    const gone = c.hp <= 0 ? " 💀" : "";
    lines.push(`${marker}**${c.name}** — HP ${Math.max(0, c.hp,)}/${c.maxHp} · AC ${c.ac}${gone}`,);
  }

  if (acting) {
    lines.push("", `_${acting.name}'s turn._`,);
  }

  const nonEmpty: string[] = [];
  for (const line of lines) {
    if (line) { nonEmpty.push(line,); }
  }

  return nonEmpty.join("\n",);
}

/**
 * The combatant that acts on the commander's behalf: the first player-side
 * combatant, falling back to the first roster entry (the `/attack` source
 * convention — the calling user is the commander, not a combatant).
 * @param battle - The active battle
 * @returns The acting combatant, or null with an empty roster
 */
export function actingCombatant(battle: BattleWithRoster,): Combatant | null {
  return battle.combatants.find((c,) => !c.isNpc) ?? battle.combatants[0] ?? null;
}

/**
 * Serialize the battle for a frontend action payload, including the acting
 * combatant's battle-usable items for the panel's Item group.
 * @param battle - The battle to serialize
 * @param usableItems - The acting combatant's battle-usable items
 * @returns The panel `BattleView` payload
 */
export function serializeBattle(
  battle: BattleWithRoster,
  usableItems: BattleItemView[] = [],
): {
  id: string;
  status: string;
  round: number;
  turnIndex: number;
  items: BattleItemView[];
  combatants: { id: string; name: string; hp: number; maxHp: number; initiative: number }[];
} {
  const combatants = Array.from(battle.combatants, (c,) => ({
    id: c.id,
    name: c.name,
    hp: Math.max(0, c.hp,),
    maxHp: c.maxHp,
    initiative: c.initiative,
  }),);

  return {
    id: battle.id,
    status: battle.status,
    round: battle.round,
    turnIndex: battle.turnIndex,
    items: usableItems,
    combatants,
  };
}
