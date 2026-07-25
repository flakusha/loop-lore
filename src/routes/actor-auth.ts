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

/** Common handler options for routes that need a database connection. */
export interface HandlerOpts {
  database: Kysely<DB>;
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
