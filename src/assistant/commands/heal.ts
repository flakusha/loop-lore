// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /heal — restore HP to a combatant in the active battle.
 *
 *   /heal <target> [amount]
 *
 *   /heal Orc        — heal Orc to full HP
 *   /heal Orc 10     — restore 10 HP to Orc
 *
 * Requires an active battle (see /battle start).
 */
import { ChatParticipantRole, } from "../../db/enums";
import {
  getActiveBattle,
  performHeal,
} from "../../rpg/service/battles";
import { formatBattle, } from "./battle";
import { findCombatant, formatRosterNames, } from "./battle-utils";
import { type CommandResult, registerCommand, } from "./registry";

registerCommand("heal", async (args, ctx,): Promise<CommandResult> => {
  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Heal unavailable:** command context missing database.", handled: true, };
  }
  const userId = ctx.userId;
  if (!userId) {
    return { systemMessage: "**Heal unavailable:** missing user context.", handled: true, };
  }

  const targetArg = (args[0] ?? "").trim();
  if (!targetArg) {
    return { systemMessage: "Usage: `/heal <target> [amount]`", handled: true, };
  }

  const active = await getActiveBattle({ database: db, }, ctx.chatId,);
  if (!active) {
    return {
      systemMessage: "**Heal:** no active battle in this chat. Start one with `/battle start`.",
      handled: true,
    };
  }

  const target = findCombatant(active.combatants, targetArg,);
  if (!target) {
    const names = formatRosterNames(active.combatants,);
    return {
      systemMessage: `**Heal:** target "${targetArg}" not found. Roster: ${names}`,
      handled: true,
    };
  }
  if (target.hp >= target.maxHp) {
    return { systemMessage: `**Heal:** ${target.name} is already at full HP.`, handled: true, };
  }

  // Default to a full heal when no amount is given.
  const amountArg = args[1];
  const amount = parseNonNegativeInt(amountArg,) ?? (target.maxHp - target.hp);
  if (amount === 0) {
    return {
      systemMessage: `**Heal:** amount must be a positive number of HP.`,
      handled: true,
    };
  }

  try {
    const result = await performHeal({
      database: db,
    }, {
      battleId: active.id,
      targetId: target.id,
      amount,
    },);

    const updatedBattle = { ...active, combatants: result.combatants, };
    const lines = [
      `**${result.combatant.name}** healed for **${result.healed} HP** (${result.combatant.hp}/${result.combatant.maxHp}).`,
      "",
      formatBattle(updatedBattle,),
    ];

    return {
      systemMessage: lines.join("\n",),
      action: "battle-updated",
      actionPayload: { battleId: active.id, },
      handled: true,
    };
  } catch (error) {
    return {
      systemMessage: `**Heal failed:** ${error instanceof Error ? error.message : "Unknown error"}`,
      handled: true,
    };
  }
}, { requiredRole: ChatParticipantRole.Owner, },);

/**
 * Parse a non-negative integer, or null when absent/invalid.
 * @param raw
 */
function parseNonNegativeInt(raw: string | undefined,): number | null {
  if (!raw) { return null; }
  const n = Number.parseInt(raw, 10,);
  return Number.isFinite(n,) && n >= 0 ? n : null;
}
