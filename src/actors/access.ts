// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor ownership guard for the child-resource services.
 *
 * Ownership is either link, matching `resolveActorAccess`
 * (src/routes/actor-access.ts): `actors.user_id` marks the user's own persona
 * (owner_id NULL), `actors.owner_id` marks a companion character they own
 * (user_id NULL). Checking `owner_id` alone denied every user persona. The
 * `admin.character` bypass applies as in `checkActorOwnership`
 * (src/routes/actor-auth.ts). Unlike the route-level helper — which collapses
 * both cases into a 404 — services distinguish a missing actor (`not_found`)
 * from an existing one owned by someone else (`forbidden`) so callers can
 * choose their own disclosure policy.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { can, } from "../users/permissions";
import type { ActorServiceError, } from "./types";

/**
 * Verify the requester may operate on the actor's child resources.
 * @param database - Database handle
 * @param actorId - Actor whose resources are being accessed
 * @param userId - Authenticated requester id
 * @param userRole - Requester role (admin roles bypass the owner check)
 * @returns An {@link ActorServiceError} to propagate, or `null` when allowed
 */
export async function requireActorOwnership(
  database: Kysely<DB>,
  actorId: string,
  userId: string,
  userRole: string | null | undefined,
): Promise<ActorServiceError | null> {
  const actor = await database
    .selectFrom("actors",)
    .select(["user_id", "owner_id",],)
    .where("id", "=", actorId,)
    .executeTakeFirst();

  if (!actor) {
    return { ok: false, code: "not_found", message: "Actor not found", };
  }

  if (
    actor.user_id === userId || actor.owner_id === userId || can(userRole, "admin.character",)
  ) {
    return null;
  }

  return { ok: false, code: "forbidden", message: "Not allowed", };
}
