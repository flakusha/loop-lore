// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Game Master Service — Decision Dispatchers
 *
 * Actor selection, GM decision production, turn recording, and
 * result building. Threaded with an explicit `state` handle.
 */
import type { GmGuidance, } from "../../chat/types/config";
import { GameMasterType, } from "../../db/enums";
import { TurnStatus, } from "../../db/enums-story/turns";
import { jsonParseOr, safeJsonStringify, } from "../../utils";
import { GM_DECISIONS, } from "../gm/decisions/registry";
import type { GameMasterDecision, StoryContext, } from "../types";
import type { BuildResultOptions, GmState, GmTurnResult, } from "./types";

/**
 * Select the next actor and produce a GM decision for the turn
 * @param state
 * @param context
 * @param debugActorId
 */
export async function getGmDecision(
  state: GmState,
  context: StoryContext,
  debugActorId: string | null = null,
): Promise<GameMasterDecision> {
  const turnContext = {
    chatMode: "story" as const,
    isPaused: state.turnManager.isPaused,
  };

  // Human-GM guidance can pin the next speaker or bias selection.
  const guidance = state.gmGuidance;
  let actorId: string | null = debugActorId;
  if (!actorId && guidance) {
    actorId = resolveGuidedActor(guidance, context, state.turnManager.state?.currentActorId ?? null,);
  }

  actorId ??= await state.turnManager.selectNextActor(undefined, turnContext,);

  if (actorId == null) {
    throw new Error("No available actors for next turn",);
  }

  const strategy = GM_DECISIONS[state.config.type] ?? GM_DECISIONS[GameMasterType.Llm];
  return strategy(
    {
      config: state.config,
      appConfig: state.appConfig,
      generateText: state.generateText,
      db: state.db,
      chatId: state.chatId,
      systemPromptDefault: state.systemPromptDefault,
      gmGuidance: state.gmGuidance,
    },
    context,
    actorId,
  );
}

/**
 * Resolve a guided actor from human-GM narrative guidance.
 *
 * `targetCharacter` is a hard override (matched by actor id or display name).
 * `turnPriority` is a soft bias: pick the highest-priority eligible actor that
 * is not the actor who just spoke. Returns null when guidance yields nothing,
 * so the caller falls back to normal turn selection.
 * @param guidance
 * @param context
 * @param lastActorId
 */
function resolveGuidedActor(
  guidance: GmGuidance,
  context: StoryContext,
  lastActorId: string | null,
): string | null {
  if (guidance.targetCharacter) {
    const match = context.actors.find(
      (a,) => a.id === guidance.targetCharacter || a.displayName === guidance.targetCharacter,
    );
    if (match) { return match.id; }
  }

  const priority = guidance.turnPriority;
  if (priority && Object.keys(priority,).length > 0) {
    const weight: Record<string, number> = { high: 3, medium: 2, low: 1, };
    const ranked: [string, string,][] = [];
    for (const [id, level,] of Object.entries(priority,)) {
      if (context.actors.some((a,) => a.id === id)) { ranked.push([id, level,],); }
    }
    ranked.sort((a, b,) => (weight[b[1]] ?? 0) - (weight[a[1]] ?? 0));
    const top = ranked[0]?.[0];
    if (top && top !== lastActorId) { return top; }
  }

  return null;
}

/**
 * Persist a pending GM turn row
 * @param state
 * @param _context
 * @param turnId
 * @param turnNumber
 * @param decision
 */
export async function recordGmTurn(
  state: GmState,
  _context: StoryContext,
  turnId: string,
  turnNumber: number,
  decision: GameMasterDecision,
): Promise<void> {
  await state.db
    .insertInto("story_turns",)
    .values({
      id: turnId,
      chat_id: state.chatId || "pending",
      turn_number: turnNumber,
      actor_id: decision.nextActorId,
      turn_type: "character_action",
      prompt_sent: decision.turnPrompt,
      status: TurnStatus.Pending,
      regeneration_count: 0,
      world_events: "[]",
      quest_progress: "[]",
      gm_decision: (() => {
        const r = safeJsonStringify(decision,);
        return r.ok ? r.value : "{}";
      })(),
    },)
    .execute();
}

/**
 * Build a GmTurnResult from a recorded turn
 * @param options
 */
export function buildResult(options: BuildResultOptions,): GmTurnResult {
  const { turn, response, qualityEval, worldEvents, accepted, escalated, regenerationSuggested, } = options;
  return {
    turnId: turn.id,
    turnNumber: turn.turn_number,
    actorId: turn.actor_id,
    prompt: turn.prompt_sent,
    response,
    qualityEvaluation: qualityEval,
    worldEvents,
    gmDecision: turn.gm_decision ? jsonParseOr(turn.gm_decision, null,) : null,
    accepted,
    escalated,
    regenerationSuggested,
    narration: null,
  };
}
