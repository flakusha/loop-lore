// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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
 * Resolve the distinct human user accounts backing a chat's participants
 * (via `actors.user_id`). AI-only actors have no backing user and are
 * skipped.
 */
export async function getChatParticipantUserIds(
  database: Kysely<DB>,
  chatId: string,
): Promise<string[]> {
  const rows = await database
    .selectFrom("chat_participants",)
    .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
    .select("actors.user_id",)
    .where("chat_participants.chat_id", "=", chatId,)
    .execute();
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.user_id !== null) { seen.add(r.user_id,); }
  }
  return [...seen];
}

/**
 * Check if a chat allows NSFW content based on participants.
 *
 * Weakest-link semantics: the requesting user AND every user-backed
 * participant must individually pass the NSFW access check (config toggle,
 * age gate, minimum age). AI-only actors contribute only their content
 * rating to `nsfwParticipants`.
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

  // Weakest link: every human participant must individually clear the
  // age/config gate — the initiator's clearance alone is not sufficient.
  const participantUserIds = await getChatParticipantUserIds(database, chatId,);
  for (const pid of participantUserIds) {
    if (pid === userId) { continue; }
    const access = await canAccessNsfw(database, config, pid,);
    if (!access.allowed) {
      return {
        allowed: false,
        reason: `participant_blocked:${access.reason ?? "unknown"}`,
        nsfwParticipants,
      };
    }
  }

  return { allowed: true, nsfwParticipants, };
}
