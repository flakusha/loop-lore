// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battle victory XP leg (FEAT-battle-rewards).
 *
 * When a battle resolves with the player side standing, every surviving
 * party member earns character XP for the defeated foes through the shared
 * LevelService pipeline — CR from the fallen NPC's level, split by party
 * size (`xpForEnemyDefeat`), one `xp_ledger` row per participant keyed to
 * the battle id so a replayed resolution can never double-pay.
 *
 * Mirrors the encounters participant-legs contract: the leg is best-effort —
 * a reward failure is logged and swallowed so resolution never fails
 * because bookkeeping did.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema.js";
import type { Combatant, } from "../../../rpg/combat.js";
import { awardXpToActor, } from "../../level/index.js";
import { xpForEnemyDefeat, } from "../../xp/sources.js";
import { log, } from "../log.js";

/** Input for the victory XP leg. */
export interface VictoryXpContext {
  /** Battle id — the ledger reference for the whole award. */
  battleId: string;
  /** Chat the battle belongs to (ledger provenance). */
  chatId: string;
  /** Final roster: survivors and the fallen. */
  combatants: Combatant[];
}

/**
 * Grant victory XP to the surviving party via the LevelService.
 * @param db
 * @param ctx
 * @returns {Promise<void>}
 */
export async function applyVictoryXpLeg(
  db: Kysely<DB>,
  ctx: VictoryXpContext,
): Promise<void> {
  try {
    const fallen = ctx.combatants.filter((c,) => c.isNpc && c.hp <= 0);
    const survivors = ctx.combatants.filter((c,) => !c.isNpc && c.hp > 0);
    if (fallen.length === 0 || survivors.length === 0) { return; }

    for (const survivor of survivors) {
      const amount = fallen.reduce(
        (sum, foe,) => sum + xpForEnemyDefeat(foe.level, survivors.length,),
        0,
      );

      await awardXpToActor(db, {
        actorId: survivor.id,
        amount,
        source: "combat",
        referenceId: ctx.battleId,
        chatId: ctx.chatId,
        description: `Victory over ${fallen.map((f,) => f.name).join(", ",)}`,
      },);
    }

    log().debug("Battle victory XP granted", {
      battleId: ctx.battleId,
      participants: survivors.length,
      foes: fallen.length,
    },);
  } catch (cause) {
    log().warn(`Victory XP skipped for battle ${ctx.battleId}:`, {
      error: cause instanceof Error ? cause.message : String(cause,),
    },);
  }
}
