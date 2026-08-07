/**
 * Find actor keys that have expired.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

/**
 * Find actor keys that have expired based on rotation days config.
 * Returns actor IDs with expired primary keys.
 */
export async function findExpiredKeys(
  database: Kysely<DB>,
  rotationDays: number,
): Promise<string[]> {
  if (rotationDays <= 0) { return []; }

  const cutoff = new Date(Date.now() - rotationDays * 24 * 60 * 60 * 1000,).toISOString();

  const expired = await database
    .selectFrom("actor_keys",)
    .select("actor_id",)
    .where("status", "=", "active",)
    .where("name", "=", "primary",)
    .where("created_at", "<", cutoff,)
    .distinct()
    .execute();

  return Array.from(expired, (r,) => r.actor_id,);
}
