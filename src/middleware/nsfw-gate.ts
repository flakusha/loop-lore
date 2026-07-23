/**
 * NSFW Gate Middleware
 *
 * Enforces NSFW content gating by combining:
 * - Age gate (user must be of minimum age)
 * - NSFW config (allowNsfw toggle + nsfwMinAge)
 * - Character content_rating (actors table column)
 * - Chat NSFW toggle (per-chat)
 *
 * Blocks NSFW content for underage users or when NSFW is disabled.
 * Logs moderation events for audit.
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import type { DB, } from "../db";
import type { ContentRating, } from "../db/enums";
import { getLogger, } from "../logger";

/** NSFW content rating levels that require age verification. */
const NSFW_RATINGS: readonly ContentRating[] = [
  "nsfw_mild",
  "nsfw_moderate",
  "nsfw_intense",
  "nsfw_extreme",
] as const;

/** Whether a content rating is considered NSFW. */
export function isNsfwRating(rating: ContentRating,): boolean {
  return NSFW_RATINGS.includes(rating,);
}

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

  return actor ? actor.content_rating : "sfw";
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

/**
 * Log an NSFW moderation event for audit.
 */
export async function logNsfwEvent(
  database: Kysely<DB>,
  event: {
    userId: string | null;
    actorId?: string;
    chatId?: string;
    action: "blocked" | "allowed" | "warning";
    reason: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const log = getLogger().child({ module: "nsfw-gate", },);
    log.info(`NSFW gate: ${event.action} — ${event.reason}`, { event, },);

    const entityType = event.actorId ? "actor" : (event.chatId ? "chat" : null);
    const entityId = event.actorId || event.chatId || null;

    const meta = event.metadata ? JSON.stringify(event.metadata,) : "{}";

    await database
      .insertInto("log_entries",)
      .values({
        id: crypto.randomUUID(),
        level: 6, // INFO
        timestamp: Date.now(),
        time: new Date().toISOString(),
        message: `NSFW gate: ${event.action} — ${event.reason}`,
        module: "nsfw-gate",
        user_id: event.userId,
        entity_type: entityType,
        entity_id: entityId,
        action: event.action,
        meta,
      },)
      .execute();
  } catch (error: unknown) {
    try {
      const log = getLogger().child({ module: "nsfw-gate", },);
      log.error("Failed to log NSFW event", error instanceof Error ? error : new Error(String(error,),), { event, },);
    } catch {
      /* logger not initialized */
    }
  }
}

/**
 * Calculate age from birth date string.
 */
function calculateAge(birthDate: string,): number {
  const birth = new Date(birthDate,);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}
