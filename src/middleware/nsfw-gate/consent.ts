// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Consent-aware NSFW gating.
 *
 * Combines base access checks with per-chat, per-user **persisted** consent
 * state and character rating enforcement. The earlier in-memory auto-grant
 * path was removed for BUG-nsfw-consent-auto-granted: any authenticated
 * user used to receive consent on chat creation, making the
 * `consentRequired` config flag a no-op.
 *
 * The persistence table (migration 069) holds an append-only ledger; the
 * latest row per (user, chat) is the source of truth — see
 * `./consent-ledger` for the ledger read/write API.
 *
 * Public API:
 *   - {@link checkNsfwWithConsent} — pre-LLM gate decision.
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db";
import type { ContentRating, } from "../../db/enums";
import { getLogger, } from "../../logger";
import { NsfwModerationService, } from "../../nsfw/moderation-service";
import { getPreferences, } from "../../nsfw/moderation-service/preferences";
import {
  type ConsentState,
  createConsentState,
  createRatingEnforcement,
  NSFW_RATING_SEVERITY,
  NSFWContentRating,
  type NSFWRatingEnforcement,
  recordConsentAction,
} from "../../schemas";
import { canAccessNsfw, getActorContentRating, getChatParticipantUserIds, } from "./access";
import { getLatestConsent, hasActiveConsent, } from "./consent-ledger";

const CONTENT_RATING_TO_NSFW: Record<ContentRating, NSFWContentRating> = {
  sfw: NSFWContentRating.SFW,
  nsfw_mild: NSFWContentRating.NSFW_MILD,
  nsfw_moderate: NSFWContentRating.NSFW_MODERATE,
  nsfw_intense: NSFWContentRating.NSFW_INTENSE,
  nsfw_extreme: NSFWContentRating.NSFW_EXTREME,
};

/**
 * Build the rating enforcement object using real persisted preferences.
 *
 * `effectiveLimit = min(character_rating, user_preference, chat_setting)`.
 * - `user_preference`: weakest link over the requesting user's persisted
 *   `max_rating` AND every user-backed chat participant's `max_rating`
 *   (group-chat weakest link; missing prefs row → NSFW_MILD, fail-closed).
 * - `chat_setting`: NSFW_EXTREME — the chats table carries only an
 *   enabled/disabled toggle (enforced in `getEffectiveNsfw`), no rating
 *   column, so the chat imposes no additional rating ceiling here.
 */
async function buildEnforcement(
  database: Kysely<DB>,
  actorId: string,
  userId: string,
  chatId: string,
): Promise<NSFWRatingEnforcement> {
  const actorRating = await getActorContentRating(database, actorId,);
  const svc = new NsfwModerationService(database,);
  const prefToRating = (maxRating: string | null | undefined,): NSFWContentRating =>
    maxRating
      ? CONTENT_RATING_TO_NSFW[maxRating as ContentRating] ?? NSFWContentRating.NSFW_MILD
      : NSFWContentRating.NSFW_MILD;

  let userMax = prefToRating((await getPreferences({ thisL: svc, userId, },))?.maxRating,);

  // Intersect all human participants' ceilings (weakest link).
  const participantUserIds = await getChatParticipantUserIds(database, chatId,);
  for (const pid of participantUserIds) {
    if (pid === userId) { continue; }
    const participantMax = prefToRating((await getPreferences({ thisL: svc, userId: pid, },))?.maxRating,);
    if (NSFW_RATING_SEVERITY[participantMax] < NSFW_RATING_SEVERITY[userMax]) {
      userMax = participantMax;
    }
  }

  return createRatingEnforcement({
    character_rating: CONTENT_RATING_TO_NSFW[actorRating] ?? NSFWContentRating.SFW,
    user_preference: userMax,
    chat_setting: NSFWContentRating.NSFW_EXTREME,
    enforcement_point: "generation",
    enforced_by: userId,
  },);
}

export interface CheckNsfwWithConsentArgs {
  database: Kysely<DB>;
  config: Config;
  userId: string | null;
  chatId: string;
  actorId: string;
}

export interface CheckNsfwWithConsentResult {
  allowed: boolean;
  reason?: string;
  enforcement: NSFWRatingEnforcement;
  consent: ConsentState;
}

/**
 * Check NSFW access with consent awareness.
 *
 * Order:
 *   1. Authenticated user required.
 *   2. Base NSFW access (config + age gate + nsfwMinAge).
 *   3. Persisted consent (when `consentRequired`), no auto-grant.
 *   4. Real enforcement object using persisted user max_rating,
 *      weakest-link intersected across chat participants.
 */
export async function checkNsfwWithConsent(
  args: CheckNsfwWithConsentArgs,
): Promise<CheckNsfwWithConsentResult> {
  const { database, config, userId, chatId, actorId, } = args;
  const log = getLogger().child({ module: "nsfw-gate-consent", },);

  const emptyConsent = (): ConsentState => createConsentState(["nsfw_encounter", "nsfw_dialogue", "nsfw_visual",],);

  if (!userId) {
    return {
      allowed: false,
      reason: "auth_required",
      enforcement: await buildEnforcement(database, actorId, "_anon", chatId,),
      consent: emptyConsent(),
    };
  }

  const baseAccess = await canAccessNsfw(database, config, userId,);
  if (!baseAccess.allowed) {
    return {
      allowed: false,
      reason: baseAccess.reason,
      enforcement: await buildEnforcement(database, actorId, userId, chatId,),
      consent: emptyConsent(),
    };
  }

  if (config.nsfw.consentRequired) {
    const persisted = await getLatestConsent(database, chatId, userId,);
    if (!hasActiveConsent(persisted,)) {
      log.info("nsfw-gate: consent required but not granted", { chatId, userId, },);
      return {
        allowed: false,
        reason: persisted ? "consent_revoked" : "consent_required",
        enforcement: await buildEnforcement(database, actorId, userId, chatId,),
        consent: emptyConsent(),
      };
    }
  }

  const enforcement = await buildEnforcement(database, actorId, userId, chatId,);
  const consent = emptyConsent();
  const persisted = await getLatestConsent(database, chatId, userId,);
  if (hasActiveConsent(persisted,)) {
    recordConsentAction(consent, "given", {
      actor: userId,
      reason: "persisted consent",
      context: { chat_id: chatId, },
    },);
  }

  return {
    allowed: true,
    enforcement,
    consent,
  };
}
