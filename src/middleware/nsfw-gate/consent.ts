// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Consent-aware NSFW gating.
 *
 * Combines base access checks with per-chat, per-user consent state
 * and character rating enforcement.
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db";
import type { ContentRating, } from "../../db/enums";
import {
  type ConsentState,
  createConsentState,
  createRatingEnforcement,
  isActionConsented,
  NSFWContentRating,
  type NSFWRatingEnforcement,
  recordConsentAction,
} from "../../schemas";
import { canAccessNsfw, getActorContentRating, } from "./access";

/**
 * Map a ContentRating string to the NSFWContentRating enum.
 */
function contentRatingToNsfw(rating: ContentRating,): NSFWContentRating {
  switch (rating) {
    case "sfw": {
      return NSFWContentRating.SFW;
    }
    case "nsfw_mild": {
      return NSFWContentRating.NSFW_MILD;
    }
    case "nsfw_moderate": {
      return NSFWContentRating.NSFW_MODERATE;
    }
    case "nsfw_intense": {
      return NSFWContentRating.NSFW_INTENSE;
    }
    case "nsfw_extreme": {
      return NSFWContentRating.NSFW_EXTREME;
    }
    default: {
      return NSFWContentRating.SFW;
    }
  }
}

/**
 * Check NSFW access with consent awareness.
 *
 * Combines age/config gating with consent state and rating enforcement.
 * Returns both access decision and enforcement details.
 */
export async function checkNsfwWithConsent(
  database: Kysely<DB>,
  config: Config,
  userId: string | null,
  chatId: string,
  actorId: string,
): Promise<{
  allowed: boolean;
  reason?: string;
  enforcement: NSFWRatingEnforcement;
  consent: ConsentState;
}> {
  // Build consent state (default — Phase 2 adds DB persistence)
  const consent = loadOrCreateConsent(database, chatId, userId,);

  // Check base NSFW access
  const baseAccess = await canAccessNsfw(database, config, userId,);
  if (!baseAccess.allowed) {
    const actorRating = await getActorContentRating(database, actorId,);
    const enforcement = createRatingEnforcement({
      character_rating: contentRatingToNsfw(actorRating,),
      user_preference: NSFWContentRating.SFW,
      chat_setting: NSFWContentRating.SFW,
      enforcement_point: "generation",
      enforced_by: userId ?? "system",
    },);
    return {
      allowed: false,
      reason: baseAccess.reason,
      enforcement,
      consent,
    };
  }

  // Check consent if required
  if (config.nsfw.consentRequired && !isActionConsented(consent, "nsfw_encounter",)) {
    const actorRating = await getActorContentRating(database, actorId,);
    const enforcement = createRatingEnforcement({
      character_rating: contentRatingToNsfw(actorRating,),
      user_preference: NSFWContentRating.SFW,
      chat_setting: NSFWContentRating.SFW,
      enforcement_point: "generation",
      enforced_by: userId ?? "system",
    },);
    return {
      allowed: false,
      reason: "consent_required",
      enforcement,
      consent,
    };
  }

  // Compute rating enforcement
  const actorRating = await getActorContentRating(database, actorId,);
  const characterNsfw = contentRatingToNsfw(actorRating,);
  const enforcement = createRatingEnforcement({
    character_rating: characterNsfw,
    user_preference: NSFWContentRating.NSFW_EXTREME, // user allowed all (age-gated)
    chat_setting: NSFWContentRating.NSFW_EXTREME, // chat allows all (consent-gated)
    enforcement_point: "generation",
    enforced_by: userId ?? "system",
  },);

  return {
    allowed: true,
    enforcement,
    consent,
  };
}

/**
 * Record consent action for NSFW in a chat.
 *
 * NOTE: Full persistence requires a consent_state table (Phase 2).
 * For now, returns the updated in-memory consent state.
 *
 * @param chatId - Chat ID
 * @param userId - User giving/revoking consent
 * @param action - "given" or "revoked"
 * @param reason - Optional reason
 */
export function recordNsfwConsent(
  chatId: string,
  userId: string,
  action: "given" | "revoked",
  reason?: string,
): ConsentState {
  const consent = createConsentState(["nsfw_encounter", "nsfw_dialogue", "nsfw_visual",],);
  recordConsentAction(consent, action, {
    actor: userId,
    reason,
    context: { chat_id: chatId, },
  },);
  return consent;
}

/**
 * Load existing consent state or create a default.
 *
 * NOTE: Full DB persistence requires a consent_state table (Phase 2).
 * Currently always returns a fresh default consent state.
 */
function loadOrCreateConsent(
  _database: Kysely<DB>,
  chatId: string,
  userId: string | null,
): ConsentState {
  const consent = createConsentState(["nsfw_encounter", "nsfw_dialogue", "nsfw_visual",],);
  if (userId) {
    recordConsentAction(consent, "given", {
      actor: userId,
      reason: "auto-consent on chat creation",
      context: { chat_id: chatId, },
    },);
  }
  return consent;
}
