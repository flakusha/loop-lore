// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /attack — resolve an attack against a combatant in the active battle.
 *
 *   /attack <target> [damageDice] [damageSides] [str|dex]
 *
 *   /attack Orc            — 1d6 flat physical melee (STR) vs Orc
 *   /attack Orc 2 8        — 2d8 physical melee (STR) vs Orc
 *   /attack Orc 1 6 dex    — 1d6 physical melee (DEX) vs Orc
 *
 * Requires an active battle (see /battle start). The attacking combatant is
 * the command's caller; the target is resolved by name/id from the roster.
 */
import { ChatParticipantRole, } from "../../db/enums";
import type { DiceSides, } from "../../rpg/dice";
import {
  getActiveBattle,
  performAttack,
} from "../../rpg/service/battles";
import { formatBattle, } from "./battle";
import { findCombatant, formatRosterNames, } from "./battle-utils";
import { type CommandResult, registerCommand, } from "./registry";

const VALID_SIDES = new Set<DiceSides>([4, 6, 8, 10, 12, 20, 100,],);

registerCommand("attack", async (args, ctx,): Promise<CommandResult> => {
  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Attack unavailable:** command context missing database.", handled: true, };
  }
  const userId = ctx.userId;
  if (!userId) {
    return { systemMessage: "**Attack unavailable:** missing user context.", handled: true, };
  }

  const targetArg = (args[0] ?? "").trim();
  if (!targetArg) {
    return { systemMessage: "Usage: `/attack <target> [damageDice] [damageSides] [str|dex]`", handled: true, };
  }

  const active = await getActiveBattle({ database: db, }, ctx.chatId,);
  if (!active) {
    return {
      systemMessage: "**Attack:** no active battle in this chat. Start one with `/battle start`.",
      handled: true,
    };
  }

  // The caller attacks as a command-side commander — pick the first player
  // combatant as the attack source (the caller isn't a roster combatant).
  const attacker = active.combatants.find((c,) => !c.isNpc) ??
    active.combatants[0];
  if (!attacker) {
    return {
      systemMessage: "**Attack:** this battle has no combatants to act with.",
      handled: true,
    };
  }

  const target = findCombatant(active.combatants, targetArg,);
  if (!target) {
    const names = formatRosterNames(active.combatants,);
    return {
      systemMessage: `**Attack:** target "${targetArg}" not found. Roster: ${names}`,
      handled: true,
    };
  }
  if (target.hp <= 0) {
    return { systemMessage: `**Attack:** ${target.name} is already defeated.`, handled: true, };
  }

  const damageDice = parsePositiveInt(args[1],) ?? 1;
  const damageSides = parseSides(args[2],);
  const ability = args[3]?.toLowerCase() === "dex" ? "dex" : "str";

  try {
    const result = await performAttack({
      database: db,
    }, {
      battleId: active.id,
      attackerId: attacker.id,
      targetId: target.id,
      attackAbility: ability,
      damageDice,
      damageSides,
      damageType: "physical",
    },);

    const updatedBattle = { ...active, combatants: result.combatants, };
    const lines = [result.attack.narration, "", formatBattle(updatedBattle,),];

    if (result.over) {
      const side = result.winner === "enemy" ? "the enemies" : "the party";
      lines.push("", `**Combat over — ${side} win!**`,);
    }

    return {
      systemMessage: lines.join("\n",),
      action: "battle-updated",
      actionPayload: { battleId: active.id, over: result.over, winner: result.winner, },
      handled: true,
    };
  } catch (error) {
    return {
      systemMessage: `**Attack failed:** ${error instanceof Error ? error.message : "Unknown error"}`,
      handled: true,
    };
  }
}, { requiredRole: ChatParticipantRole.Owner, },);

/**
 * Parse a positive integer, or null when absent/invalid.
 * @param raw
 */
function parsePositiveInt(raw: string | undefined,): number | null {
  if (!raw) { return null; }
  const n = Number.parseInt(raw, 10,);
  return Number.isFinite(n,) && n > 0 ? n : null;
}

/**
 * Parse a dice side count; defaults to 6 (d6).
 * @param raw
 */
function parseSides(raw: string | undefined,): DiceSides {
  if (!raw) { return 6; }
  const n = Number.parseInt(raw, 10,);
  return VALID_SIDES.has(n as DiceSides,) ? (n as DiceSides) : 6;
}
