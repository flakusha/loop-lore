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
 * latest row per (user, chat) is the source of truth. Revocations stamp
 * `revoked_at` on the most recent open `given` row, so the latest row is
 * the unique signal for `hasActiveConsent`.
 *
 * Public API:
 *   - {@link checkNsfwWithConsent} — pre-LLM gate decision.
 *   - {@link recordNsfwConsent} — explicit user action; persists a row.
 *   - {@link getLatestConsent} — read latest consent row.
 *   - {@link hasActiveConsent} — pure predicate.
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db";
import type { ContentRating, } from "../../db/enums";
import {
  type ConsentState,
  createConsentState,
  createRatingEnforcement,
  NSFW_RATING_SEVERITY,
  NSFWContentRating,
  type NSFWRatingEnforcement,
  recordConsentAction,
} from "../../schemas";
import { getLogger, } from "../../logger";
import { getPreferences, } from "../../nsfw/moderation-service/preferences";
import { NsfwModerationService, } from "../../nsfw/moderation-service";
import { canAccessNsfw, getActorContentRating, getChatParticipantUserIds, } from "./access";

/** Default scope for NSFW encounters; matches the existing in-memory consent. */
const DEFAULT_SCOPE = "nsfw_encounter";

/** Cap on free-form reason text; prevents log-injection style overflow. */
const REASON_MAX_CHARS = 500;

/** Single source of truth for the consent action enum. */
type ConsentAction = "given" | "revoked";

/** DB row shape from `nsfw_consent_state` (camel-cased projection). */
interface ConsentStateRow {
  id: string;
  userId: string;
  chatId: string;
  action: ConsentAction;
  scope: string;
  reason: string | null;
  createdAt: string;
  revokedAt: string | null;
}

const CONTENT_RATING_TO_NSFW: Record<ContentRating, NSFWContentRating> = {
  sfw: NSFWContentRating.SFW,
  nsfw_mild: NSFWContentRating.NSFW_MILD,
  nsfw_moderate: NSFWContentRating.NSFW_MODERATE,
  nsfw_intense: NSFWContentRating.NSFW_INTENSE,
  nsfw_extreme: NSFWContentRating.NSFW_EXTREME,
};

/**
 * Read the latest persisted consent row for (userId, chatId). Returns
 * `null` if the user has never explicitly consented nor revoked.
 */
export async function getLatestConsent(
  database: Kysely<DB>,
  chatId: string,
  userId: string,
): Promise<ConsentStateRow | null> {
  const row = await database
    .selectFrom("nsfw_consent_state",)
    .selectAll()
    .where("user_id", "=", userId,)
    .where("chat_id", "=", chatId,)
    .orderBy("created_at", "desc",)
    .limit(1,)
    .executeTakeFirst();

  if (!row) { return null; }
  return {
    id: row.id,
    userId: row.user_id,
    chatId: row.chat_id,
    action: row.action as ConsentAction,
    scope: row.scope,
    reason: row.reason ?? null,
    createdAt: row.created_at,
    revokedAt: row.revoked_at ?? null,
  };
}

/** Pure predicate: row is a `given` action with no `revoked_at` stamp. */
export function hasActiveConsent(row: ConsentStateRow | null,): boolean {
  return row?.action === "given" && row.revokedAt === null;
}

/** Trim or null a free-form reason to keep the audit trail bounded. */
function sanitizeReason(reason: string | undefined,): string | null {
  if (!reason) { return null; }
  return reason.slice(0, REASON_MAX_CHARS,);
}

export interface RecordNsfwConsentOptions {
  database: Kysely<DB>;
  chatId: string;
  userId: string;
  action: ConsentAction;
  reason?: string;
  scope?: string;
}

/**
 * Record an explicit user consent action. Persists to `nsfw_consent_state`
 * and stamps `revoked_at` on prior open `given` rows so `hasActiveConsent`
 * has a unique source-of-truth row.
 */
export async function recordNsfwConsent(
  options: RecordNsfwConsentOptions,
): Promise<ConsentStateRow> {
  const { database, chatId, userId, action, } = options;
  const scope = options.scope ?? DEFAULT_SCOPE;
  const reason = sanitizeReason(options.reason,);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await database
    .insertInto("nsfw_consent_state",)
    .values({
      id,
      user_id: userId,
      chat_id: chatId,
      action,
      scope,
      reason,
      created_at: now,
      revoked_at: null,
    },)
    .execute();

  // Whatever the new action, close any prior open `given` rows so the latest
  // row is the unique signal for `hasActiveConsent`.
  await database
    .updateTable("nsfw_consent_state",)
    .set({ revoked_at: now, },)
    .where("user_id", "=", userId,)
    .where("chat_id", "=", chatId,)
    .where("action", "=", "given",)
    .where("revoked_at", "is", null,)
    .where("id", "!=", id,)
    .execute();

  return {
    id,
    userId,
    chatId,
    action,
    scope,
    reason,
    createdAt: now,
    revokedAt: action === "revoked" ? now : null,
  };
}

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

  const emptyConsent = (): ConsentState =>
    createConsentState(["nsfw_encounter", "nsfw_dialogue", "nsfw_visual",],);

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
