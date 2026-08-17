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
import { getCharacterStats, } from "../../rpg/service";
import { buildCombatant, } from "../../rpg/service/battles.js";

export interface ResolvedRosterItem {
  combatant: Combatant;
  actorId: string;
  name: string;
}

/**
 * Resolve the combatant roster for a chat.
 *
 * Returns one combatant per non-calling participant actor that has a
 * `character_stats` row, keyed by actor id. Participants without stats (e.g.
 * human users, narrators) are skipped.
 *
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
    .where("chat_participants.chat_id", "=", chatId,)
    .where("chat_participants.actor_id", "!=", callerActorId,)
    .select(["actors.id", "actors.display_name",],)
    .execute();

  const roster: ResolvedRosterItem[] = [];
  for (const p of participants) {
    const stats = await getCharacterStats({ database: db, }, p.id,);
    if (!stats) { continue; }
    roster.push({
      actorId: p.id,
      name: p.display_name,
      combatant: buildCombatant(
        p.id,
        p.display_name,
        { str: stats.str, dex: stats.dex, con: stats.con, int: stats.int, wis: stats.wis, cha: stats.cha, },
        stats.level,
        stats.hp,
        stats.ac,
        false,
      ),
    },);
  }
  return roster;
}

/**
 * Find a combatant in a battle roster by a loose name/id match.
 *
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
 *
 * @param combatants - The roster
 * @returns A comma-joined name list, or "none" when empty
 */
export function formatRosterNames(combatants: { name: string }[],): string {
  if (combatants.length === 0) { return "none"; }
  return Array.from(combatants, (c,) => c.name,).join(", ",);
}
