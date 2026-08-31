// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Game Master Service — Public Types
 *
 * Story turn record, build-result options, and GM turn result types.
 */
import type { Kysely, } from "kysely";
import type { GmGuidance, } from "../../chat/types/config";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import type { GenerateTextFn, } from "../gm/decisions/types";
import type { QualityEvaluator, } from "../quality-evaluator";
import type { TurnManager, } from "../turn-manager";
import type { GameMasterConfig, GameMasterDecision, QualityEvaluation, WorldEvent, } from "../types";
import type { WorldStateService, } from "../world-state";

/**
 * Function provided by the caller to actually invoke an LLM.
 * Keeps GameMasterService independent of provider resolution.
 */
export type { GenerateTextFn, } from "../gm/decisions/types";

// ── Shared dispatcher state ─────────────────────────────────

/**
 * Mutable view of the service state threaded through dispatchers.
 * The class exposes its private fields via this shape so sibling
 * dispatch modules can operate on them without holding a reference
 * to the class instance.
 */
export interface GmState {
  db: Kysely<DB>;
  turnManager: TurnManager;
  worldState: WorldStateService;
  evaluator: QualityEvaluator;
  config: GameMasterConfig;
  appConfig: Config | undefined;
  /** Human-GM narrative guidance steering this turn (from chat gm_config). */
  gmGuidance?: GmGuidance;
  chatId: string;
  generateText: GenerateTextFn;
  systemPromptDefault: string | undefined;
}

// ── Story turn row type (from DB) ──────────────────────────

/** */
export interface StoryTurnRecord {
  id: string;
  turn_number: number;
  actor_id: string;
  prompt_sent: string;
  chat_id: string;
  turn_type: string;
  status: string;
  regeneration_count: number;
  world_events: string;
  quest_progress: string;
  completed_at: string | null;
  started_at: string;
  created_at: string;
  updated_at: string;
  response_received: string | null;
  quality_score: number | null;
  quality_details: string | null;
  gm_decision: string | null;
}

/** */
export interface BuildResultOptions {
  turn: StoryTurnRecord;
  response: string;
  qualityEval: QualityEvaluation;
  worldEvents: WorldEvent[];
  accepted: boolean;
  escalated: boolean;
  regenerationSuggested: boolean;
}

// ── GM Decision Result ──────────────────────────────────────

/** */
export interface GmTurnResult {
  turnId: string;
  turnNumber: number;
  actorId: string;
  prompt: string;
  response: string | null;
  qualityEvaluation: QualityEvaluation | null;
  worldEvents: WorldEvent[];
  gmDecision: GameMasterDecision | null;
  accepted: boolean;
  escalated: boolean;
  regenerationSuggested: boolean;
  narration: string | null;
}
