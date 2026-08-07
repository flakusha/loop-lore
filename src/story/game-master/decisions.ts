/**
 * Game Master Service — Decision Dispatchers
 *
 * Actor selection, GM decision production, turn recording, and
 * result building. Threaded with an explicit `state` handle.
 */
import { GameMasterType, } from "../../db/enums";
import { jsonParseOr, safeJsonStringify, } from "../../utils";
import { GM_DECISIONS, } from "../gm/decisions/registry";
import type { GameMasterDecision, StoryContext, } from "../types";
import type { BuildResultOptions, GmState, GmTurnResult, } from "./types";

/** Select the next actor and produce a GM decision for the turn */
export async function getGmDecision(
  state: GmState,
  context: StoryContext,
  debugActorId?: string,
): Promise<GameMasterDecision> {
  const turnContext = {
    chatMode: "story" as const,
    isPaused: state.turnManager.isPaused,
  };
  const actorId = debugActorId ?? (await state.turnManager.selectNextActor(undefined, turnContext,));

  if (!actorId) {
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
    },
    context,
    actorId,
  );
}

/** Persist a pending GM turn row */
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
      status: "pending",
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

/** Build a GmTurnResult from a recorded turn */
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
