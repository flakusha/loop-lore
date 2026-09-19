// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { Config, } from "../../../config/schema";
import type { IntimacyActionType, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import type { NSFWContentRating, } from "../../../schemas";

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

// ── NSFW Gate ─────────────────────────────────────────────

/**
 * Request-scoped context the NSFW capability gate needs. When supplied to
 * an intimacy mutation, the mutation routes through `assertNsfwCapability`
 * (rating + consent + intimacy threshold) before touching any state.
 */
export interface NsfwGateContext {
  config: Config;
  /** Requesting human user (null = anonymous). */
  userId: string | null;
  chatId: string;
  /** Rating of the content about to be produced; defaults to the actor's. */
  contentRating?: NSFWContentRating;
  /** Extra rating ceilings folded into the effective limit. */
  ratingLimits?: NSFWContentRating[];
  /** Consent-scoped action to assert (default "nsfw_encounter"). */
  consentAction?: string;
}

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
  /** NSFW capability gate context; enforced when present (TASK-033). */
  gate?: NsfwGateContext;
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
