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
 * Per-participant isolation: each survivor is wrapped individually, so one
 * broken sheet starves nobody else. Survivors are deduped by actor id (a
 * roster echo must not dilute the split), and a floored-to-0 share writes
 * nothing — the dedupe key must not be consumed by an award nobody earned.
 *
 * Mirrors the encounters participant-legs contract: the leg is best-effort —
 * a reward failure is logged and swallowed so resolution never fails
 * because bookkeeping did.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema.js";
import type { Combatant, } from "../../../rpg/combat.js";
import { awardXpToActor, } from "../../level/index.js";
import { checkMechanicEnabled, RpgMechanic, } from "../../service/world-gate.js";
import { xpForEnemyDefeat, XpSource, } from "../../xp/sources.js";
import { log, } from "../log.js";

/** Input for the victory XP leg. */
export interface VictoryXpContext {
  /** Battle id — the ledger reference for the whole award. */
  battleId: string;
  /** Chat the battle belongs to (ledger provenance). */
  chatId: string;
  /** World the battle belongs to — the rpg_xp gate. Null stays fail-open. */
  worldId?: string | null;
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
    // Per-world rpg_xp opt-in (FEAT-gate-xp): battles without a world stay
    // fail-open like the chat command gate.
    if (ctx.worldId) {
      const gate = await checkMechanicEnabled(db, ctx.worldId, RpgMechanic.Xp,);
      if (!gate.allowed) {
        log().debug("Victory XP skipped: world opted out", {
          worldId: ctx.worldId,
          battleId: ctx.battleId,
        },);

        return;
      }
    }

    const fallen = ctx.combatants.filter((c,) => c.isNpc && c.hp <= 0);
    // Roster echoes (the same actor listed twice) must not dilute the split.
    const survivorIds = new Set<string>();
    for (const combatant of ctx.combatants) {
      if (!combatant.isNpc && combatant.hp > 0) { survivorIds.add(combatant.id,); }
    }

    if (fallen.length === 0 || survivorIds.size === 0) { return; }

    for (const actorId of survivorIds) {
      try {
        const amount = fallen.reduce(
          (sum, foe,) => sum + xpForEnemyDefeat(foe.level, survivorIds.size,),
          0,
        );

        // A 0 share (huge party, floor split) writes nothing: the battle-id
        // dedupe key must stay spendable for a corrected re-resolution.
        if (amount <= 0) { continue; }

        await awardXpToActor(db, {
          actorId,
          amount,
          source: XpSource.Combat,
          referenceId: ctx.battleId,
          chatId: ctx.chatId,
          description: `Victory over ${fallen.map((f,) => f.name).join(", ",)}`,
        },);
      } catch (cause) {
        // One participant's failure (broken/missing sheet) must not starve
        // the rest of the roster.
        log().warn(`Victory XP skipped for ${actorId} in battle ${ctx.battleId}:`, {
          error: cause instanceof Error ? cause.message : String(cause,),
        },);
      }
    }

    log().debug("Battle victory XP granted", {
      battleId: ctx.battleId,
      participants: survivorIds.size,
      foes: fallen.length,
    },);
  } catch (cause) {
    log().warn(`Victory XP skipped for battle ${ctx.battleId}:`, {
      error: cause instanceof Error ? cause.message : String(cause,),
    },);
  }
}
