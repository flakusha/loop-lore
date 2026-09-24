// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { InteractionOutcome, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { jsonStringifyOr, safeJsonParse, } from "../../utils";
import { rollDice, } from "../dice";
import { AdvantageMode, } from "../dice/types";
import { findMissingMaterials, } from "./materials";
import { getAbilityModifier, parseInteractionModifiers, } from "./modifiers";
import type {
  InteractionContext,
  InteractionResolution,
  InteractionService,
  InteractionSummary,
  RecentInteractionParams,
  ResolvedInteraction,
  ResolveInteractionParams,
} from "./types";

const formatOutcome = (outcome: InteractionResolution["outcome"],): string => outcome.replaceAll("_", " ",);

export async function resolveInteraction(
  database: Kysely<DB>,
  params: ResolveInteractionParams,
): Promise<InteractionResolution> {
  const advantage = params.advantage ?? AdvantageMode.Normal;
  const abilityModifiers = await getAbilityModifier(database, params.actorId, params.skill,);
  const modifiers = [...abilityModifiers, ...(params.modifiers ?? []),];
  const context: InteractionContext = {
    actorId: params.actorId,
    chatId: params.chatId,
    worldId: params.worldId ?? null,
    targetActorId: params.targetActorId ?? null,
    locationId: params.locationId ?? null,
    actionPoints: Math.max(0, Math.floor(params.actionPoints ?? 1,),),
    skill: params.skill,
    difficulty: params.difficulty,
    advantage,
    modifiers,
  };
  const id = randomUUID();
  const missing = await findMissingMaterials(database, params.actorId, params.requirements ?? [],);

  if (missing.length > 0) {
    await database
      .insertInto("interaction_logs",)
      .values({
        id,
        chat_id: params.chatId,
        world_id: context.worldId,
        actor_id: params.actorId,
        target_actor_id: context.targetActorId,
        location_id: context.locationId,
        command: params.command,
        category: params.category,
        skill: params.skill,
        difficulty: params.difficulty,
        roll_sides: null,
        roll_count: null,
        roll_modifier: null,
        roll_mode: null,
        roll_values: null,
        roll_raw_total: null,
        roll_total: null,
        roll_margin: null,
        outcome: InteractionOutcome.Blocked,
        action_points: context.actionPoints,
        modifiers: jsonStringifyOr(modifiers,),
        result: jsonStringifyOr({ missingMaterials: missing, },),
        state_changes: jsonStringifyOr({},),
      },)
      .execute();
    return {
      id,
      context,
      roll: null,
      outcome: InteractionOutcome.Blocked,
      margin: null,
      stateChanges: {},
      systemMessage: `**Interaction blocked:** missing required materials: ${missing.join(", ",)}.`,
    };
  }

  const modifierTotal = modifiers.reduce((total, modifier,) => total + modifier.value, 0,);
  const roll = rollDice(20, 1, modifierTotal, advantage,);
  const margin = roll.total - params.difficulty;
  const outcome = roll.natural20
    ? InteractionOutcome.CriticalSuccess
    : roll.natural1
    ? InteractionOutcome.CriticalFailure
    : margin >= 0
    ? InteractionOutcome.Success
    : InteractionOutcome.Failure;
  const draft: ResolvedInteraction = { context, roll, outcome, margin, };
  const stateChanges = params.stateChange ? await params.stateChange(draft,) : {};
  const result = {
    command: params.command,
    category: params.category,
    skill: params.skill,
    difficulty: params.difficulty,
    outcome,
    advantage,
    modifierBreakdown: modifiers,
    roll: {
      sides: 20,
      values: roll.dice.map((die,) => die.value),
      rawTotal: roll.rawTotal,
      total: roll.total,
      margin,
    },
  };

  await database
    .insertInto("interaction_logs",)
    .values({
      id,
      chat_id: params.chatId,
      world_id: context.worldId,
      actor_id: params.actorId,
      target_actor_id: context.targetActorId,
      location_id: context.locationId,
      command: params.command,
      category: params.category,
      skill: params.skill,
      difficulty: params.difficulty,
      roll_sides: 20,
      roll_count: 1,
      roll_modifier: modifierTotal,
      roll_mode: roll.advantageMode,
      roll_values: jsonStringifyOr(roll.dice.map((die,) => die.value),),
      roll_raw_total: roll.rawTotal,
      roll_total: roll.total,
      roll_margin: margin,
      outcome,
      action_points: context.actionPoints,
      modifiers: jsonStringifyOr(modifiers,),
      result: jsonStringifyOr(result,),
      state_changes: jsonStringifyOr(stateChanges,),
    },)
    .execute();

  return {
    id,
    context,
    roll,
    outcome,
    margin,
    stateChanges,
    systemMessage: `**/${params.command}** ${
      formatOutcome(outcome,)
    }: ${roll.total} vs DC ${params.difficulty} (margin ${margin >= 0 ? "+" : ""}${margin}).`,
  };
}

export async function getRecentInteractions(
  database: Kysely<DB>,
  params: RecentInteractionParams,
): Promise<InteractionSummary[]> {
  const rows = await database
    .selectFrom("interaction_logs",)
    .select([
      "command",
      "category",
      "skill",
      "difficulty",
      "roll_total",
      "roll_margin",
      "roll_mode",
      "outcome",
      "modifiers",
      "state_changes",
    ],)
    .where("chat_id", "=", params.chatId,)
    .orderBy("created_at", "desc",)
    .limit(params.limit ?? 10,)
    .execute();

  return rows.map((row,) => {
    const parsed = safeJsonParse<Record<string, unknown>>(row.state_changes,);
    return {
      command: row.command,
      category: row.category,
      skill: row.skill,
      difficulty: row.difficulty,
      rollTotal: row.roll_total,
      rollMargin: row.roll_margin,
      advantage: row.roll_mode === AdvantageMode.Advantage
        ? AdvantageMode.Advantage
        : row.roll_mode === AdvantageMode.Disadvantage
        ? AdvantageMode.Disadvantage
        : AdvantageMode.Normal,
      outcome: row.outcome,
      modifiers: parseInteractionModifiers(row.modifiers,),
      stateChanges: parsed.ok ? parsed.value : {},
    };
  },);
}

export function InteractionService(database: Kysely<DB>,): InteractionService {
  return {
    resolve: (params,) => resolveInteraction(database, params,),
    recent: (params,) => getRecentInteractions(database, params,),
  };
}
