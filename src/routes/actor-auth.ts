// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor Ownership Authorization
 *
 * Shared helper for routes that operate on actors.
 * Checks if the requesting user owns the actor or has admin/solo privileges.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db";
import { can, } from "../users/permissions";
import { HttpStatus, jsonError, requireUserId, } from "./http-utils";

/** Common handler options for routes that need a database connection. */
export interface HandlerOpts {
  database: Kysely<DB>;
}

/** Minimal Elysia context shape needed for actor-access checks. */
export interface ActorAccessContext {
  params: { actorId: string };
  userRole?: string | null;
  t?: (key: string, ...args: unknown[]) => string;
}

/**
 * Require an authenticated user with access to the actor.
 *
 * Returns the userId on success, or a localized error Response (401
 * unauthenticated / 404 not-found-or-unauthorized) to return as-is.
 * @param ctx - Elysia handler context (must carry `params.actorId`, optional `userRole`, `t`)
 * @param database - Database handle used for the ownership check
 * @returns The authenticated userId, or a Response to short-circuit the handler
 */
export async function requireActorAccess(
  ctx: ActorAccessContext,
  database: Kysely<DB>,
): Promise<string | Response> {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }

  const { actorId, } = ctx.params;
  if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole ?? null,))) {
    return jsonError({
      message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
      status: HttpStatus.NotFound,
    },);
  }

  return userId;
}

/** Actor ids resolved by a successful `requireOwnedActor`. */
export interface OwnedActor {
  userId: string;
  actorId: string;
}

/**
 * `requireActorAccess` plus the `params.actorId` destructure every handler
 * repeats, so the ownership check and the id read cannot drift apart.
 * @param ctx - Elysia handler context (must carry `params.actorId`)
 * @param database - Database handle used for the ownership check
 * @returns The resolved ids, or a Response to short-circuit the handler
 */
export async function requireOwnedActor(
  ctx: ActorAccessContext,
  database: Kysely<DB>,
): Promise<Response | OwnedActor> {
  const userId = await requireActorAccess(ctx, database,);
  if (userId instanceof Response) { return userId; }
  return { userId, actorId: ctx.params.actorId, };
}

/**
 * Check if user owns the actor (or is admin/solo).
 * @param database
 * @param actorId
 * @param userId
 * @param userRole
 * @returns {Promise<boolean>}
 */
export async function checkActorOwnership(
  database: Kysely<DB>,
  actorId: string,
  userId: string | null,
  userRole: string | null,
): Promise<boolean> {
  const actor = await database
    .selectFrom("actors",)
    .select("owner_id",)
    .where("id", "=", actorId,)
    .executeTakeFirst();

  if (!actor) { return false; }
  return actor.owner_id === userId || can(userRole, "admin.character",);
}
