// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { RelationshipsService, } from "../../characters/services/relationships-service";
import { InteractionOutcome, RelationshipType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import {
  INTERACTION_COMMANDS,
  type InteractionCommandDefinition,
  type InteractionModifier,
  InteractionService,
} from "../../rpg/interaction";
import { checkCommandMechanic, RpgMechanic, } from "../../rpg/service/world-gate";
import { getReputationTier, } from "../../schemas/reputation";
import { type CommandContext, type CommandResult, registerCommand, } from "./registry";

const RELATIONSHIP_CHECK_MODIFIERS = {
  hostile: -5,
  unfriendly: -2,
  neutral: 0,
  friendly: 2,
  allied: 5,
  devoted: 5,
} as const;

const resolveTargetActor = async (
  database: Kysely<DB>,
  target: string,
): Promise<string | null> => {
  const row = await database
    .selectFrom("actors",)
    .select("id",)
    .where((builder,) =>
      builder.or([
        builder("id", "=", target,),
        builder("display_name", "=", target,),
      ],)
    )
    .executeTakeFirst();
  return row?.id ?? null;
};

const getRelationshipModifiers = async (
  database: Kysely<DB>,
  targetActorId: string | null,
  actorId: string,
  worldId: string | null,
): Promise<InteractionModifier[]> => {
  if (!targetActorId || !worldId) { return []; }
  const relationship = await RelationshipsService(database,).getRelationship(
    targetActorId,
    actorId,
    worldId,
  );
  if (!relationship) { return []; }
  const value = RELATIONSHIP_CHECK_MODIFIERS[getReputationTier(relationship.standing,)];
  return value === 0 ? [] : [{ source: "relationship.standing", value, },];
};

const applyRelationshipRipple = async (
  database: Kysely<DB>,
  definition: InteractionCommandDefinition,
  targetActorId: string | null,
  actorId: string,
  worldId: string | null,
  outcome: InteractionOutcome,
): Promise<Record<string, unknown>> => {
  if (!targetActorId || !worldId || !definition.ripple) { return {}; }
  const successful = outcome === InteractionOutcome.Success || outcome === InteractionOutcome.CriticalSuccess;
  const favorDelta = successful
    ? definition.ripple.favorDelta
    : definition.ripple.failureFavorDelta ?? -Math.abs(definition.ripple.favorDelta,);
  const renownDelta = successful
    ? definition.ripple.renownDelta
    : definition.ripple.failureRenownDelta ?? 0;
  const relationships = RelationshipsService(database,);
  const relationship = await relationships.getRelationship(targetActorId, actorId, worldId,);
  if (!relationship) {
    await relationships.createRelationship({
      actorId: targetActorId,
      targetActorId: actorId,
      worldId,
      relationshipType: RelationshipType.Neutral,
      metadata: { source: "interaction", },
    },);
  }
  await relationships.logEvent({
    actorId: targetActorId,
    targetActorId: actorId,
    worldId,
    eventType: definition.ripple.event,
    standingDelta: favorDelta,
    familiarityDelta: renownDelta,
    metadata: { source: "interaction", command: definition.command, outcome, },
  },);
  return {
    relationship: {
      sourceActorId: targetActorId,
      targetActorId: actorId,
      standingDelta: favorDelta,
      familiarityDelta: renownDelta,
      event: definition.ripple.event,
    },
  };
};

const runInteraction = async (
  definition: InteractionCommandDefinition,
  args: string[],
  ctx: CommandContext,
): Promise<CommandResult> => {
  if (!ctx.db || !ctx.userId) {
    return { systemMessage: "Interaction commands require an authenticated player and database.", handled: true, };
  }
  const denial = await checkCommandMechanic(ctx.db, ctx.activeChat?.worldId, RpgMechanic.Checks,);
  if (denial) { return { systemMessage: denial, handled: true, }; }

  let targetActorId: string | null = null;
  if (definition.target === "required") {
    const target = args[0];
    if (!target) { return { systemMessage: definition.usage, handled: true, }; }
    targetActorId = await resolveTargetActor(ctx.db, target,);
    if (!targetActorId) {
      return { systemMessage: `**/${definition.command}:** target not found.`, handled: true, };
    }
  }

  const modifiers = await getRelationshipModifiers(
    ctx.db,
    targetActorId,
    ctx.userId,
    ctx.activeChat?.worldId ?? null,
  );
  const resolution = await InteractionService(ctx.db,).resolve({
    command: definition.command,
    category: definition.category,
    actorId: ctx.userId,
    chatId: ctx.chatId,
    worldId: ctx.activeChat?.worldId,
    targetActorId,
    actionPoints: definition.actionPoints,
    skill: definition.skill,
    difficulty: definition.difficulty,
    modifiers,
    stateChange: definition.ripple
      ? (draft,) =>
        applyRelationshipRipple(
          ctx.db!,
          definition,
          draft.context.targetActorId,
          draft.context.actorId,
          draft.context.worldId,
          draft.outcome,
        )
      : undefined,
  },);
  return {
    systemMessage: resolution.systemMessage,
    action: "interaction-resolved",
    actionPayload: {
      id: resolution.id,
      command: definition.command,
      outcome: resolution.outcome,
      margin: resolution.margin,
      stateChanges: resolution.stateChanges,
    },
    handled: true,
  };
};

for (const definition of Object.values(INTERACTION_COMMANDS,)) {
  registerCommand(definition.command, (args, ctx,) => runInteraction(definition, args, ctx,),);
}

export { applyRelationshipRipple, getRelationshipModifiers, resolveTargetActor, runInteraction, };
