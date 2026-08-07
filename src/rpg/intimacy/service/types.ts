import type { Kysely, } from "kysely";
import type { IntimacyActionType, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";

// ── Constants ──────────────────────────────────────────────

/** Intimacy score boundaries for level classification. */
export const INTIMACY_THRESHOLDS = {
  strangers: 0,
  acquaintances: 10,
  friends: 25,
  closeFriends: 40,
  romanticInterest: 55,
  dating: 70,
  intimate: 85,
  soulbonded: 100,
} as const;

// ── Types ──────────────────────────────────────────────────

/** An intimacy action that affects the score. */
export interface IntimacyAction {
  id: string;
  name: string;
  type: IntimacyActionType;
  /** Score delta (positive = build, negative = lose). */
  delta: number;
  /** Minimum intimacy required to perform this action. */
  minIntimacy: number;
  /** Optional: relationship types that allow this action. */
  allowedRelationships?: string[];
  /** Whether consent is required for this action. */
  requiresConsent: boolean;
}

/** Threshold event fired when intimacy reaches a level. */
export interface IntimacyThreshold {
  level: number;
  label: string;
  unlock: string;
  npcReaction: string;
  gameplayEffects: string[];
}

/** A recorded intimacy action in history. */
export interface IntimacyHistoryEntry {
  actionId: string;
  actionName: string;
  delta: number;
  timestamp: string;
  context?: string;
}

/** Intimacy pair result from DB. */
export interface IntimacyPair {
  id: string;
  actorId: string;
  targetActorId: string;
  worldId: string | null;
  score: number;
  actionHistory: IntimacyHistoryEntry[];
  unlockedThresholds: number[];
  createdAt: string;
  updatedAt: string;
}

/** Options for applying an intimacy action. */
export interface ApplyIntimacyActionOpts {
  database: Kysely<DB>;
  actorId: string;
  targetActorId: string;
  worldId?: string | null;
  action: IntimacyAction;
  context?: string;
}

/** Result of applying an intimacy action. */
export interface ApplyIntimacyResult {
  /** New intimacy score after applying the action. */
  newScore: number;
  /** Score change (may be modified by conditions). */
  actualDelta: number;
  /** Whether the action was applied. */
  applied: boolean;
  /** Reason if not applied. */
  reason?: string;
  /** Threshold events that fired. */
  thresholdsReached: IntimacyThreshold[];
  /** Whether the pair's relationship type should upgrade. */
  suggestedRelationshipUpgrade?: string;
}
