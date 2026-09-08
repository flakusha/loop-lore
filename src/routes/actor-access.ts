// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor access authorization — shared ownership guard for user-persona actors.
 *
 * Consolidates the previously triplicated `resolveActorAccess` copies that
 * lived in `routes/trade/shared.ts`, `routes/crafting/attempt.ts`, and
 * `routes/battle/equipment-durability.ts`. Each checked that the request's
 * `userId` owns the targeted actor row via `actors.user_id`, returning 403 on
 * mismatch and 404 on a missing actor.
 *
 * Semantics note: this guard checks `actors.user_id` — the column that marks
 * an actor row as *the user's own persona* — not `actors.owner_id` (which
 * marks characters a user owns). Routes that operate on the caller's persona
 * (crafting, trade, battle durability) use this; routes that operate on owned
 * characters should use `checkActorOwnership` from `./actor-auth`.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { jsonError, notFoundResponse, } from "./http-utils";

/**
 * Ensure the given actor row belongs to the requesting user.
 *
 * Ownership is either link: `user_id` (user-actors) or `owner_id`
 * (character companions created with `owner_id: userId` — the same predicate
 * as `checkActorOwnership` in actor-auth.ts).
 *
 * Returns `null` when the user owns the actor, a 404 `Response` when the actor
 * does not exist, and a 403 `Response` when the actor belongs to another user.
 * The caller short-circuits by returning a non-null response as-is:
 *
 *     const denied = await resolveActorAccess(database, body.actorId, userId);
 *     if (denied) { return denied; }
 *
 * @param db      Kysely database handle.
 * @param actorId Actor row id to check.
 * @param userId  Authenticated user id.
 * @returns Denial `Response`, or `null` when access is allowed.
 */
export async function resolveActorAccess(
  db: Kysely<DB>,
  actorId: string,
  userId: string,
): Promise<Response | null> {
  const actor = await db.selectFrom("actors",)
    .select(["user_id", "owner_id",],)
    .where("id", "=", actorId,)
    .executeTakeFirst();
  if (!actor) { return notFoundResponse("Actor",); }
  if (actor.user_id !== userId && actor.owner_id !== userId) { return jsonError("Not allowed", 403,); }
  return null;
}

/**
 * Resolve the authenticated user's primary persona actor id.
 *
 * The primary persona is the actor row where `user_id = $userId AND
 * owner_id IS NULL` — the user's own player-actor, not a character
 * they own. At most one such row per user in normal operation.
 *
 * Returns `null` when no primary persona exists (the user has not been
 * provisioned yet — typically only during a race on first login). Routes
 * that require an actor should treat `null` as 404.
 *
 * Used by seen-state endpoints to derive the actor server-side from the
 * session, closing the trust-boundary inversion where the client
 * previously supplied `actorId` (always null on the frontend, see
 * BUG-chat-seen-currentActorId-never-assigned).
 * @param db     Kysely database handle.
 * @param userId Authenticated user id (from `ctx.userId`).
 * @returns Primary persona actor id, or `null` when none exists.
 */
export async function resolvePrimaryActorId(
  db: Kysely<DB>,
  userId: string,
): Promise<string | null> {
  const row = await db.selectFrom("actors",)
    .select("id",)
    .where("user_id", "=", userId,)
    .where("owner_id", "is", null,)
    .executeTakeFirst();
  return row?.id ?? null;
}
