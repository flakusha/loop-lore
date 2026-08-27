// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Message seen-state service layer.
 *
 * Viewership ledger covering both human users and AI characters (via
 * `actor_id`). Reuses `checkChatAccess` from `./access` so access policy stays
 * consistent with reactions and other message interactions.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { checkChatAccess, } from "./access";
import type { ServiceError, } from "./types";

export interface SeenStateRecord {
  messageId: string;
  actorId: string;
  state: "unseen" | "processing" | "seen";
  seenAt: string | null;
}

/**
 * Get the grouped viewer list for a message.
 *
 * @returns `{ ok: true, viewers }` or a `ServiceError` (404/403).
 */
export async function getMessageSeen(
  db: Kysely<DB>,
  messageId: string,
  chatId: string,
  userId: string,
  userRole: string | null,
): Promise<
  | { ok: true; viewers: { actorId: string; state: string; seenAt: string | null }[] }
  | ServiceError
> {
  const access = await checkChatAccess(db, chatId, userId, userRole,);
  if (!access.ok) { return access.error; }

  const rows = await db
    .selectFrom("message_seen",)
    .select(["actor_id", "state", "seen_at",],)
    .where("message_id", "=", messageId,)
    .execute();

  return {
    ok: true,
    viewers: rows.map((r,) => ({
      actorId: r.actor_id,
      state: r.state,
      seenAt: r.seen_at ?? null,
    })),
  };
}

/**
 * Record a seen-state for an actor on a message.
 *
 * Upserts the `(message_id, actor_id)` ledger row. When the caller is the
 * actor marking themselves, the request is identity-checked against the
 * `actor_id` derived from the user's `user_id` (see `resolveActorId`).
 *
 * @returns `{ ok: true }` or a `ServiceError`.
 */
export async function recordMessageSeen(
  db: Kysely<DB>,
  messageId: string,
  chatId: string,
  actorId: string,
  userId: string,
  userRole: string | null,
  state: "unseen" | "processing" | "seen" = "seen",
): Promise<{ ok: true } | ServiceError> {
  const access = await checkChatAccess(db, chatId, userId, userRole,);
  if (!access.ok) { return access.error; }

  const now = new Date().toISOString();
  await db
    .insertInto("message_seen",)
    .values({
      id: `ms-${messageId}-${actorId}`,
      message_id: messageId,
      actor_id: actorId,
      state,
      seen_at: state === "seen" || state === "processing" ? now : null,
      created_at: now,
    },)
    .onConflict((oc,) =>
      // Kysely's onConflict column resolution differs by driver; the `.columns`
      // form is the idiomatic upsert key. When state advances, update both
      // `state` and `seen_at`; on reset, only `state`.
      (oc as any)
        .columns(["message_id", "actor_id",],)
        .doUpdateSet({
          state,
          seen_at: state === "seen" || state === "processing" ? now : undefined,
        },)
    )
    .execute();

  return { ok: true, };
}

/**
 * Delete a seen-state row (reset to unseen).
 *
 * @returns `{ ok: true }` or a `ServiceError`.
 */
export async function deleteMessageSeen(
  db: Kysely<DB>,
  messageId: string,
  chatId: string,
  actorId: string,
  userId: string,
  userRole: string | null,
): Promise<{ ok: true } | ServiceError> {
  const access = await checkChatAccess(db, chatId, userId, userRole,);
  if (!access.ok) { return access.error; }

  await db
    .deleteFrom("message_seen",)
    .where("message_id", "=", messageId,)
    .where("actor_id", "=", actorId,)
    .execute();

  return { ok: true, };
}
