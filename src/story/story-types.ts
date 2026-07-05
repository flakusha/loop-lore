/**
 * Story Feature Types — Core Domain
 *
 * Game master config, turn manager state, quality evaluation,
 * world/NPC/location state, and story session context.
 */
import type {
  TurnStrategy as TS,
  GameMasterType as GMT,
  TurnType as TT,
  QualityDimension as QD,
} from "../db/enums";
import type { WorldEvent, NpcState } from "./story-events-types";
import type { QuestConfig } from "./quest-types";

// ─── Game Master Config ──────────────────────────────────────────
export interface GameMasterConfig {
  type: GMT;
  llmConfig?: {
    model: string;
    provider: string;
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
  };
  humanGM?: {
    actorId: string;
    notifications: boolean;
  };
  escalationThreshold?: number;
}

export interface TurnManagerState {
  currentTurn: number;
  currentActorId: string | null;
  turnOrder: string[];
  strategy: TS;
  isPaused: boolean;
  lastTurnCompletedAt: string | null;
  maxTurns?: number;
  pendingRegeneration: {
    turnId: string;
    attempt: number;
    reason: string;
  } | null;
}

// ─── Quality Evaluation ──────────────────────────────────────────
export interface QualityScores {
  character_voice: number;
  plot_coherence: number;
  lore_consistency: number;
  narrative_quality: number;
  quest_relevance: number;
  creativity: number;
  overall: number;
}

export interface QualityEvaluation {
  scores: QualityScores;
  passed: boolean;
  regenerationReason: string | null;
  escalationReason: string | null;
  details: Record<QD, { score: number; reasoning: string }>;
}

export interface QualityThresholds {
  accept: number;
  regenerate: number;
  escalate: number;
  maxRegenerations: number;
}

export const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = {
  accept: 70,
  regenerate: 40,
  escalate: 40,
  maxRegenerations: 3,
};

export const DEFAULT_QUALITY_WEIGHTS: Record<QD, number> = {
  character_voice: 0.25,
  plot_coherence: 0.2,
  lore_consistency: 0.2,
  narrative_quality: 0.15,
  quest_relevance: 0.1,
  creativity: 0.1,
};

// ─── GM Decision ─────────────────────────────────────────────────
export interface GameMasterDecision {
  nextActorId: string;
  turnPrompt: string;
  turnConstraints: {
    maxTokens: number;
    tone?: string;
    focus?: string;
  };
  narration?: string;
  questUpdates: { questId: string; progress: number; note: string }[];
  worldStateChanges: WorldEvent[];
}

// ─── Story Session Context ───────────────────────────────────────
export interface StoryContext {
  world: {
    id: string;
    name: string;
    lore: string;
    currentLocation: {
      id: string;
      name: string;
      description: string;
      atmosphere: string | null;
      timeOfDay: string | null;
      weather: string | null;
    };
  };
  activeQuests: {
    id: string;
    name: string;
    type: import("../db/enums").QuestType;
    progress: number;
    target: number;
    config: QuestConfig;
  }[];
  actors: {
    id: string;
    displayName: string;
    actorType: string;
    agentType: string;
    systemPrompt: string | null;
    locationId: string | null;
    npcState?: NpcState;
  }[];
  recentTurns: {
    turnNumber: number;
    actorId: string;
    turnType: TT;
    prompt: string;
    response: string | null;
    qualityScore: number | null;
  }[];
  turnManagerState: TurnManagerState;
}
