/**
 * NSFW access checks — user age/config gating and chat/actor rating checks.
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db";
import type { ContentRating, } from "../../db/enums";
import { calculateAge, isNsfwRating, NSFW_INTIMACY_THRESHOLD, } from "./constants";

/**
 * Check if a user is allowed to access NSFW content.
 *
 * Combines:
 * - NSFW config (allowNsfw toggle)
 * - User age (from birth_date + nsfwMinAge)
 * - Age gate acceptance
 */
export async function canAccessNsfw(
  database: Kysely<DB>,
  config: Config,
  userId: string | null,
): Promise<{ allowed: boolean; reason?: string }> {
  // NSFW globally disabled
  if (!config.nsfw.allowNsfw) {
    return { allowed: false, reason: "nsfw_disabled", };
  }

  // No user — require auth for NSFW
  if (!userId) {
    return { allowed: false, reason: "auth_required", };
  }

  // Check user age
  const user = await database
    .selectFrom("users",)
    .select(["birth_date", "age_gate_accepted_at",],)
    .where("id", "=", userId,)
    .executeTakeFirst();

  if (!user) {
    return { allowed: false, reason: "user_not_found", };
  }

  // Age gate must be accepted
  if (!user.age_gate_accepted_at) {
    return { allowed: false, reason: "age_gate_not_accepted", };
  }

  // Check minimum age for NSFW
  if (user.birth_date) {
    const age = calculateAge(user.birth_date,);
    if (age < config.nsfw.nsfwMinAge) {
      return { allowed: false, reason: `underage:${age}`, };
    }
  }

  return { allowed: true, };
}

/**
 * Check if a character (actor) has NSFW content that requires gating.
 */
export async function getActorContentRating(
  database: Kysely<DB>,
  actorId: string,
): Promise<ContentRating> {
  const actor = await database
    .selectFrom("actors",)
    .select("content_rating",)
    .where("id", "=", actorId,)
    .executeTakeFirst();

  return actor ? (actor.content_rating as ContentRating) : "sfw";
}

/**
 * Check if intimacy level is sufficient for NSFW content.
 *
 * Returns the current intimacy score and whether it meets the threshold.
 */
export async function checkIntimacyForNsfw(
  database: Kysely<DB>,
  actorId: string,
  targetActorId: string,
  worldId: string | null = null,
): Promise<{ sufficient: boolean; score: number; threshold: number }> {
  const pair = await database
    .selectFrom("character_intimacy",)
    .select("score",)
    .where("actor_id", "=", actorId,)
    .where("target_actor_id", "=", targetActorId,)
    .where("world_id", "is", worldId,)
    .executeTakeFirst();

  const score = pair?.score ?? 0;
  return {
    sufficient: score >= NSFW_INTIMACY_THRESHOLD,
    score,
    threshold: NSFW_INTIMACY_THRESHOLD,
  };
}

/**
 * Check if a chat allows NSFW content based on participants.
 *
 * A chat allows NSFW if ALL participants have NSFW content ratings
 * AND the user is allowed to access NSFW.
 */
export async function checkChatNsfwAccess(
  database: Kysely<DB>,
  config: Config,
  userId: string | null,
  chatId: string,
): Promise<{ allowed: boolean; reason?: string; nsfwParticipants: string[] }> {
  // First check user-level access
  const userAccess = await canAccessNsfw(database, config, userId,);
  if (!userAccess.allowed) {
    return { allowed: false, reason: userAccess.reason, nsfwParticipants: [], };
  }

  // Check all participants' content ratings
  const participants = await database
    .selectFrom("chat_participants",)
    .select("actor_id",)
    .where("chat_id", "=", chatId,)
    .execute();

  const nsfwParticipants: string[] = [];

  for (const participant of participants) {
    const rating = await getActorContentRating(database, participant.actor_id,);
    if (isNsfwRating(rating,)) {
      nsfwParticipants.push(participant.actor_id,);
    }
  }

  // If there are NSFW participants but user can't access NSFW, block
  if (nsfwParticipants.length > 0 && !userAccess.allowed) {
    return {
      allowed: false,
      reason: "nsfw_participants_blocked",
      nsfwParticipants,
    };
  }

  return { allowed: true, nsfwParticipants, };
}
