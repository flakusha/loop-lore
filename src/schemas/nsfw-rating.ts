// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/schemas/nsfw-rating.ts — NSFW Content Rating & Enforcement
//
// Shared across Character Core, Chat Lifecycle, and NSFW systems.
// Provides the 5-tier rating enum and runtime enforcement contract.

// ── Rating Enum ───────────────────────────────────────────────

/** 5-tier NSFW content rating system. */
export enum NSFWContentRating {
  SFW = "sfw",
  NSFW_MILD = "nsfw_mild",
  NSFW_MODERATE = "nsfw_moderate",
  NSFW_INTENSE = "nsfw_intense",
  NSFW_EXTREME = "nsfw_extreme",
}

/**
 * Numeric severity for comparison (higher = more permissive).
 * SFW=0, NSFW_MILD=1, ..., NSFW_EXTREME=4.
 */
export const NSFW_RATING_SEVERITY: Record<NSFWContentRating, number> = {
  [NSFWContentRating.SFW]: 0,
  [NSFWContentRating.NSFW_MILD]: 1,
  [NSFWContentRating.NSFW_MODERATE]: 2,
  [NSFWContentRating.NSFW_INTENSE]: 3,
  [NSFWContentRating.NSFW_EXTREME]: 4,
};

/** Rating hierarchy from most restrictive to most permissive. */
export const NSFW_RATING_HIERARCHY: readonly NSFWContentRating[] = [
  NSFWContentRating.SFW,
  NSFWContentRating.NSFW_MILD,
  NSFWContentRating.NSFW_MODERATE,
  NSFWContentRating.NSFW_INTENSE,
  NSFWContentRating.NSFW_EXTREME,
] as const;

// ── Enforcement Contract ──────────────────────────────────────

/** Where enforcement is applied in the pipeline. */
export type EnforcementPoint = "generation" | "render" | "storage";

/**
 * Runtime enforcement state for NSFW content ratings.
 * Determines the effective content limit based on character, user, and chat settings.
 */
export interface NSFWRatingEnforcement {
  /** The character's content rating. */
  character_rating: NSFWContentRating;
  /** The user's maximum allowed rating. */
  user_preference: NSFWContentRating;
  /** The chat/room setting. */
  chat_setting: NSFWContentRating;
  /** Effective limit = min(character, user, chat). */
  effective_limit: NSFWContentRating;
  /** Where this enforcement is applied. */
  enforcement_point: EnforcementPoint;
  /** Whether admin bypass is allowed. */
  bypass_allowed: boolean;
  /** Reason for bypass (if applicable). */
  bypass_reason?: string;
  /** When this enforcement was computed. */
  enforced_at: Date;
  /** Who/what enforced this (user ID, "system", "admin"). */
  enforced_by: string;
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Compute the effective rating limit from multiple sources.
 * Takes the most restrictive (lowest severity) rating.
 *
 * @param ratings - Array of ratings to compare
 * @returns The most restrictive rating
 */
export function computeEffectiveRating(
  ...ratings: NSFWContentRating[]
): NSFWContentRating {
  if (ratings.length === 0) { return NSFWContentRating.SFW; }
  let most: NSFWContentRating = ratings[0]!;
  for (let i = 1; i < ratings.length; i++) {
    const current: NSFWContentRating = ratings[i]!;
    if (NSFW_RATING_SEVERITY[current] < NSFW_RATING_SEVERITY[most]) {
      most = current;
    }
  }
  return most;
}

/**
 * Check if a content rating is allowed by an enforcement limit.
 *
 * @param content_rating - Rating of the content
 * @param limit - Maximum allowed rating
 * @returns true if content is within the limit
 */
export function isRatingAllowed(
  content_rating: NSFWContentRating,
  limit: NSFWContentRating,
): boolean {
  return NSFW_RATING_SEVERITY[content_rating] <= NSFW_RATING_SEVERITY[limit];
}

/**
 * Create an NSFWRatingEnforcement from component ratings.
 *
 * @param params - Component ratings and context
 * @returns A fully computed enforcement state
 */
export function createRatingEnforcement(params: {
  character_rating: NSFWContentRating;
  user_preference: NSFWContentRating;
  chat_setting: NSFWContentRating;
  enforcement_point: EnforcementPoint;
  bypass_allowed?: boolean;
  bypass_reason?: string;
  enforced_by?: string;
}): NSFWRatingEnforcement {
  const effective_limit = computeEffectiveRating(
    params.character_rating,
    params.user_preference,
    params.chat_setting,
  );
  return {
    character_rating: params.character_rating,
    user_preference: params.user_preference,
    chat_setting: params.chat_setting,
    effective_limit,
    enforcement_point: params.enforcement_point,
    bypass_allowed: params.bypass_allowed ?? false,
    bypass_reason: params.bypass_reason,
    enforced_at: new Date(),
    enforced_by: params.enforced_by ?? "system",
  };
}
