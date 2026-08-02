/**
 * Actor Ownership Authorization
 *
 * Shared helper for routes that operate on actors.
 * Checks if the requesting user owns the actor or has admin/solo privileges.
 *
 * @module routes/actor-auth
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db";
import { HttpStatus, jsonError, } from "./http-utils";

/** Common handler options for routes that need a database connection. */
export interface HandlerOpts {
  database: Kysely<DB>;
}

/** Minimal shape of an Elysia context needed to resolve the acting user. */
export interface CtxUserGuard {
  userId?: unknown;
  t?: (key: string,) => string | undefined;
}

/**
 * Resolve the authenticated user id from a route context.
 *
 * Returns an Unauthorized `Response` when no user is present; callers must
 * `return` it. On success returns the resolved `userId` as a string.
 */
export function requireCtxUser(ctx: CtxUserGuard,): string | Response {
  const userId = ctx.userId as string | null;
  if (!userId) {
    return jsonError({
      message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
      status: HttpStatus.Unauthorized,
    },);
  }
  return userId;
}

/** Check if user owns the actor (or is admin/solo). */
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
  return actor.owner_id === userId || userRole === "admin" || userRole === "solo";
}
