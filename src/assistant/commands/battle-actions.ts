// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `/battle use` + `/battle social` subcommand handlers.
 *
 * Split from `battle.ts` (which dispatches into these) so each file stays
 * under the 250L gate. Both handlers act through the battles service the
 * same way `/attack` and `/heal` do: the acting combatant is the first
 * player-side roster entry (the calling user is the commander), and the
 * result flows back to the panel as a `battle-updated` action payload.
 *
 * Note: the slash-command parser splits on whitespace without quote
 * awareness, so quoted multi-word names arrive as separate args; needles are
 * re-joined and de-quoted here before loose matching.
 */

import {
  type BattleItemView,
  type BattleWithRoster,
  findUsableItem,
  getActiveBattle,
  listUsableBattleItems,
  parseSocialAction,
  performSocialAction,
  useBattleItem,
} from "../../rpg/service/battles";
import {
  actingCombatant,
  findCombatant,
  formatBattle,
  serializeBattle,
} from "./battle-utils";
import type { CommandContext, CommandResult, } from "./registry";

/**
 * Split `/battle use` args into an item needle and an optional target needle
 * by greedily matching leading args against the actor's usable items.
 * @param items - The actor's battle-usable items
 * @param args - Raw command args after `use`
 * @returns The matched item + remaining target needle, or null when nothing matches
 */
export function splitItemArgs(
  items: BattleItemView[],
  args: string[],
): { item: BattleItemView; targetArgs: string[] } | null {
  for (let take = 1; take <= args.length; take++) {
    const needle = dequote(args.slice(0, take,).join(" ",),);
    const item = findUsableItem(items, needle,);
    if (item) { return { item, targetArgs: args.slice(take,), }; }
  }

  return null;
}

/**
 * Strip argument-quoting double quotes from a re-joined needle.
 * @param raw - Joined raw args
 */
function dequote(raw: string,): string {
  return raw.replaceAll('"', "",).trim();
}

/**
 * Handle `/battle use <item> [target]` — consume a battle-usable item.
 * @param args - Args after the `use` subcommand
 * @param ctx - Command context
 */
export async function handleBattleUse(args: string[], ctx: CommandContext,): Promise<CommandResult> {
  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Item unavailable:** command context missing database.", handled: true, };
  }

  const active = await getActiveBattle({ database: db, }, ctx.chatId,);
  if (!active) {
    return { systemMessage: "**Item:** no active encounter to use items in.", handled: true, };
  }

  const actor = actingCombatant(active,);
  if (!actor) {
    return { systemMessage: "**Item:** the battle roster is empty.", handled: true, };
  }

  const items = await listUsableBattleItems({ database: db, }, actor.id,);
  if (items.length === 0) {
    return {
      systemMessage: `**Item:** ${actor.name} has no battle-usable items (consumables with an on-use heal effect).`,
      handled: true,
    };
  }

  const split = splitItemArgs(items, args,);
  if (!split) {
    return {
      systemMessage: `Usage: \`/battle use <item> [target]\` — usable: ${items.map((i,) => i.name).join(", ",)}`,
      handled: true,
    };
  }

  const targetArg = dequote(split.targetArgs.join(" ",),);
  const target = targetArg ? findCombatant(active.combatants, targetArg,) : actor;
  if (!target) {
    return { systemMessage: `**Item:** no combatant matches "${targetArg}".`, handled: true, };
  }

  try {
    const result = await useBattleItem({ database: db, }, {
      battleId: active.id,
      actorId: actor.id,
      targetId: target.id,
      itemId: split.item.id,
    },);

    const battleAfter: BattleWithRoster = { ...active, combatants: result.combatants, };
    const itemsAfter = await listUsableBattleItems({ database: db, }, actor.id,);
    const lines = [
      `**${result.actor.name}** uses **${result.item.name}** on ${result.target.name} — restores **${result.healed} HP**.`,
      "",
      formatBattle(battleAfter,),
    ];

    return {
      systemMessage: lines.join("\n",),
      action: "battle-updated",
      actionPayload: { battleId: active.id, battle: serializeBattle(battleAfter, itemsAfter,), },
      handled: true,
    };
  } catch (error) {
    return {
      systemMessage: `**Item failed:** ${error instanceof Error ? error.message : "Unknown error"}`,
      handled: true,
    };
  }
}

/**
 * Handle `/battle social <intimidate|taunt|negotiate|surrender> <target>`.
 * @param args - Args after the `social` subcommand
 * @param ctx - Command context
 */
export async function handleBattleSocial(
  args: string[],
  ctx: CommandContext,
): Promise<CommandResult> {
  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Social unavailable:** command context missing database.", handled: true, };
  }

  const verb = parseSocialAction(args[0],);
  if (!verb) {
    return {
      systemMessage: "Usage: `/battle social <intimidate|taunt|negotiate|surrender> <target>`",
      handled: true,
    };
  }

  const targetArg = dequote(args.slice(1,).join(" ",),);
  if (!targetArg) {
    return { systemMessage: `**Social:** \`/battle social ${verb}\` needs a target.`, handled: true, };
  }

  const active = await getActiveBattle({ database: db, }, ctx.chatId,);
  if (!active) {
    return { systemMessage: "**Social:** no active encounter to act in.", handled: true, };
  }

  const actor = actingCombatant(active,);
  if (!actor) {
    return { systemMessage: "**Social:** the battle roster is empty.", handled: true, };
  }

  const target = findCombatant(active.combatants, targetArg,);
  if (!target) {
    return { systemMessage: `**Social:** no combatant matches "${targetArg}".`, handled: true, };
  }

  if (target.id === actor.id) {
    return { systemMessage: "**Social:** pick another combatant as the target.", handled: true, };
  }

  try {
    const result = await performSocialAction({ database: db, }, {
      battleId: active.id,
      action: verb,
      actorId: actor.id,
      targetId: target.id,
    },);

    const lines = [
      `**${verb}** — ${result.actor.name} → ${result.target.name}`,
      result.outcome,
      "",
      formatBattle(active,),
    ];

    return {
      systemMessage: lines.join("\n",),
      action: "battle-updated",
      actionPayload: {
        battleId: active.id,
        battle: serializeBattle(active, await listUsableBattleItems({ database: db, }, actor.id,),),
      },
      handled: true,
    };
  } catch (error) {
    return {
      systemMessage: `**Social failed:** ${error instanceof Error ? error.message : "Unknown error"}`,
      handled: true,
    };
  }
}
