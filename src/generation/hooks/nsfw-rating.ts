// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW rating resolution for the nsfw hook: level-string → rating enum,
 * effective-limit computation (weakest link across actor / user / chat),
 * and the allow check.
 */
import {
  computeEffectiveRating,
  isRatingAllowed,
  NSFWContentRating,
} from "../../schemas";
import type { HookContext, } from "./types";

/** Map hook-detected level string to NSFWContentRating enum.
 *  Accepts both short names ("extreme") and full enum values ("nsfw_extreme"). */
export function levelToRating(level: string,): NSFWContentRating {
  switch (level) {
    case "extreme":
    case "nsfw_extreme": {
      return NSFWContentRating.NSFW_EXTREME;
    }
    case "intense":
    case "nsfw_intense": {
      return NSFWContentRating.NSFW_INTENSE;
    }
    case "moderate":
    case "nsfw_moderate": {
      return NSFWContentRating.NSFW_MODERATE;
    }
    case "mild":
    case "nsfw_mild": {
      return NSFWContentRating.NSFW_MILD;
    }
    default: {
      return NSFWContentRating.SFW;
    }
  }
}

/**
 * Compute effective content limit using the NSFWRatingEnforcement contract.
 * effective_limit = min(actor_rating, user_max_rating, chat_setting).
 * Falls back to nsfwPolicy-based limit when contract fields are absent.
 */
export function computeEffectiveLimit(context: HookContext,): NSFWContentRating {
  const actorRating = context.actorContentRating
    ? levelToRating(context.actorContentRating,)
    : undefined;
  const userRating = context.maxUserRating
    ? levelToRating(context.maxUserRating,)
    : undefined;
  const chatRating = context.chatNsfwOverride
    ? levelToRating(context.chatNsfwOverride,)
    : undefined;

  // When all three contract fields are present, use the contract
  if (actorRating !== undefined && userRating !== undefined && chatRating !== undefined) {
    return computeEffectiveRating(actorRating, userRating, chatRating,);
  }

  // Fallback: use nsfwPolicy (legacy path)
  const policy = context.nsfwPolicy ?? "mild";
  return levelToRating(policy,);
}

/** Weakest-link allow check: content rating must be within the effective limit. */
export function isAllowed(level: string, context: HookContext,): boolean {
  const contentRating = levelToRating(level,);
  const effectiveLimit = computeEffectiveLimit(context,);
  return isRatingAllowed(contentRating, effectiveLimit,);
}
