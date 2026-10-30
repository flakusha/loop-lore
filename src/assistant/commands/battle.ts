// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /battle — start, inspect, or end a chat RPG encounter.
 *
 *   /battle             — show the active battle (roster, round, turn)
 *   /battle start       — start a battle from the chat's participants
 *   /battle status      — show the active battle state
 *   /battle align <t> <player|enemy> — set a combatant's battle side
 *   /battle end         — end (abandon) the active battle
 *
 * Backed by the durable battles service (src/rpg/service/battles.ts); the
 * combat engine (src/rpg/combat) resolves each action.
 */
import type { Kysely, } from "kysely";
import { ChatParticipantRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import {
  type BattleItemView,
  BattleStatus,
  type BattleWithRoster,
  endBattle,
  getActiveBattle,
  listUsableBattleItems,
  startBattle,
} from "../../rpg/service/battles";
import { checkCommandMechanic, RpgMechanic, } from "../../rpg/service/world-gate";
import { handleBattleSocial, handleBattleUse, } from "./battle-actions";
import {
  actingCombatant,
  CombatAlignment,
  findCombatant,
  formatBattle,
  formatRosterNames,
  resolveBattleRoster,
  serializeBattle,
} from "./battle-utils";
import { type CommandResult, registerCommand, } from "./registry";

registerCommand("battle", async (args, ctx,): Promise<CommandResult> => {
  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Battle unavailable:** command context missing database.", handled: true, };
  }

  const userId = ctx.userId;
  if (!userId) {
    return { systemMessage: "**Battle unavailable:** missing user context.", handled: true, };
  }

  const denial = await checkCommandMechanic(db, ctx.activeChat?.worldId, RpgMechanic.Combat,);
  if (denial) { return { systemMessage: denial, handled: true, }; }

  const sub = (args[0] ?? "").toLowerCase();

  // ── status / default ───────────────────────────────────
  if (sub === "" || sub === "status") {
    const active = await getActiveBattle({ database: db, }, ctx.chatId,);
    if (!active) {
      return {
        systemMessage: "**Battle:** no active encounter in this chat. Use `/battle start` to begin one.",
        handled: true,
      };
    }

    return {
      systemMessage: formatBattle(active,),
      action: "battle-status",
      actionPayload: {
        battle: serializeBattle(
          active,
          await payloadItems(db, active,),
        ),
      },
      handled: true,
    };
  }

  // ── start ──────────────────────────────────────────────
  if (sub === "start") {
    const roster = await resolveBattleRoster(db, ctx.chatId, userId,);
    if (roster.length === 0) {
      return {
        systemMessage:
          "**Battle:** no combatants found — chat participants need `character_stats` to join. Join characters before starting a battle.",
        handled: true,
      };
    }

    try {
      const combatants = Array.from(roster, (r,) => r.combatant,);
      const battle = await startBattle({
        database: db,
      }, {
        chatId: ctx.chatId,
        worldId: ctx.activeChat?.worldId ?? null,
        createdBy: userId,
        combatants,
      },);

      const names = formatRosterNames(battle.combatants,);
      return {
        systemMessage: `**Battle started!**\n\nCombatants: ${names}\n\n${formatBattle(battle,)}`,
        action: "battle-started",
        actionPayload: {
          battle: serializeBattle(
            battle,
            await payloadItems(db, battle,),
          ),
        },
        handled: true,
      };
    } catch (error) {
      return {
        systemMessage: `**Battle failed:** ${error instanceof Error ? error.message : "Unknown error"}`,
        handled: true,
      };
    }
  }

  // ── end ────────────────────────────────────────────────
  if (sub === "end") {
    const active = await getActiveBattle({ database: db, }, ctx.chatId,);
    if (!active) {
      return { systemMessage: "**Battle:** no active encounter to end.", handled: true, };
    }

    await endBattle({ database: db, }, active.id, BattleStatus.Abandoned,);
    return {
      systemMessage: "**Battle ended.**",
      action: "battle-ended",
      actionPayload: { battleId: active.id, },
      handled: true,
    };
  }

  // ── align ──────────────────────────────────────────────
  if (sub === "align") {
    return alignCombatant(db, ctx.chatId, userId, args[1] ?? "", args[2] ?? "",);
  }

  // ── use ────────────────────────────────────────────────
  if (sub === "use") {
    return handleBattleUse(args.slice(1,), ctx,);
  }

  // ── social ─────────────────────────────────────────────
  if (sub === "social") {
    return handleBattleSocial(args.slice(1,), ctx,);
  }

  return {
    systemMessage:
      "Usage: `/battle [start|status|align <target> <player|enemy>|use <item> [target]|social <action> <target>|end]`",
    handled: true,
  };
}, { requiredRole: ChatParticipantRole.Owner, capabilities: ["write-world", "write-character",], },);

/**
 * Set a roster combatant's battle side (`player` or `enemy`).
 * @param db - Database handle
 * @param chatId - Chat whose roster to inspect
 * @param userId - The commanding actor (excluded from the roster)
 * @param targetArg - Target combatant name/id
 * @param side - Desired alignment (`player` or `enemy`)
 * @returns A confirmation or error CommandResult
 */
async function alignCombatant(
  db: Kysely<DB>,
  chatId: string,
  userId: string,
  targetArg: string,
  side: string,
): Promise<CommandResult> {
  const targetName = targetArg.trim();
  if (
    !targetName ||
    (side !== CombatAlignment.Player && side !== CombatAlignment.Enemy)
  ) {
    return { systemMessage: "Usage: `/battle align <target> <player|enemy>`", handled: true, };
  }

  const roster = await resolveBattleRoster(db, chatId, userId,);
  const target = findCombatant(Array.from(roster, (r,) => r.combatant,), targetName,);
  if (!target) {
    return {
      systemMessage:
        `**Battle:** target "${targetName}" not found among combatants. Align a character that has joined the chat.`,
      handled: true,
    };
  }

  await db
    .updateTable("character_stats",)
    .set({ combat_alignment: side, },)
    .where("actor_id", "=", target.id,)
    .execute();

  return {
    systemMessage: `**${target.name}** is now a **${side}** combatant. Run \`/battle start\` to rebuild the roster.`,
    handled: true,
  };
}

/**
 * List the acting combatant's battle-usable items for a panel payload.
 * @param db - Database handle
 * @param battle - The battle being serialized
 */
async function payloadItems(
  db: Kysely<DB>,
  battle: BattleWithRoster,
): Promise<BattleItemView[]> {
  const actor = actingCombatant(battle,);
  if (!actor) { return []; }
  return listUsableBattleItems({ database: db, }, actor.id,);
}
