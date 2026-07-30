// src/characters/services/shared-service-utils.ts
//
// Shared helpers for character services (mood, relationships, traits).
// Eliminates duplicate worldId query filtering and existence-check patterns.

/**
 * Apply worldId conditional filter to a Kysely query builder.
 * Handles the null-world (global) vs specific-world distinction.
 *
 * Usage:
 *   const qb = db.selectFrom("table").where("actor_id", "=", actorId);
 *   const filtered = withWorldId(qb, worldId);
 *   const result = await filtered.selectAll().executeTakeFirst();
 */

export function withWorldId<T,>(qb: T, worldId: string | undefined, worldCol = "world_id",): T {
  // Kysely's $if is typed per-table; the generic cast is unavoidable here.

  const chain = (qb as any).$if(
    !!worldId,
    (q: any,) => q.where(worldCol, "=", worldId!,),
  );
  return chain.$if(
    !worldId,
    (q: any,) => q.where(worldCol, "is", null,),
  ) as T;
}

/**
 * Throw if an entity already exists. Call before INSERT to guard duplicates.
 *
 * @param existing - Truthy value means the entity already exists
 * @param entityLabel - Human-readable entity name (e.g., "Mood", "Permanent trait")
 * @param key - Identifying context for the error message
 */
export function guardNotExists(
  existing: unknown,
  entityLabel: string,
  key: string,
): void {
  if (existing) {
    throw new Error(`${entityLabel} already exists for ${key}`,);
  }
}
