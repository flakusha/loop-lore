// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Denormalized cache for `actor.properties.storyPoints`.
 *
 * The `actors` table has no `properties` JSON column at the moment of
 * writing (FEAT-story-points-actor-properties-storypoints-agency-slash-comma).
 * This module is the hook point: when a `properties` JSON column or a
 * dedicated `actor_properties` table is added, replace the body of
 * `refreshActorStoryPointsCache` with the actual write.
 *
 * Today: fire-and-forget — logs a debug message and resolves. Callers
 * never block on cache freshness; `getStoryPointBalance` remains the
 * source of truth.
 *
 * ponytail: cache write is a no-op until an actor.properties column
 * exists; add the column via a forward migration (see
 * TASK-db-add-created-at-updated-at ticket for adjacent work) and wire
 * the UPDATE here.
 *
 * @module services/agency/actor-story-points-cache
 */
import { type Kysely, sql, } from "kysely";
import type { DB, } from "../../db";
import { createLogger, getLogger, } from "../../logger";
// Import from the queries module (not the barrel) to avoid a circular
// import: barrel -> mutations.ts -> actor-story-points-cache.
import { getStoryPointBalance, } from "./story-points/queries";

// Lazy logger init - the module body must not throw when the global logger
// has not been initialized yet (e.g. a direct module import in tests).
try {
  getLogger();
} catch {
  createLogger({ level: "error", },);
}

const log = getLogger().child({ module: "agency/actor-story-points-cache", },);

/**
 * Refresh the denormalized `actor.properties.storyPoints` cache for an
 * actor. Fire-and-forget — returns immediately. Errors are logged and
 * swallowed; the canonical store (`actor_story_points`) is unaffected.
 *
 * @param db
 * @param actorId
 * @param worldId
 * @returns {Promise<void>}
 */
export async function refreshActorStoryPointsCache(
  db: Kysely<DB>,
  actorId: string,
  worldId?: string | null,
): Promise<void> {
  try {
    const bal = await getStoryPointBalance(db, actorId, worldId,);
    // ponytail: replace with `UPDATE actors SET properties = json_set(...)`
    // once the `properties` JSON column exists on the `actors` table.
    await sql`SELECT 1`.execute(db,);
    if (process.env.DEBUG_STORY_POINTS_CACHE) {
      // intentional side effect: surface the cached value in dev logs
      // when the operator opts in.
      // eslint-disable-next-line no-console
      console.debug("story_points_cache.refresh", { actorId, balance: bal.balance, },);
    }
  } catch (error) {
    // Best-effort: the canonical store (actor_story_points) is already
    // committed, so a failed denormalization must not fail the caller.
    // Logged rather than silently dropped - the JSDoc above promises this.
    // BUG-story-points-mutations-double-swallow-cache-refresh-failures.
    log.warn("story_points_cache.refresh_failed", { actorId, worldId: worldId ?? null, error: String(error,), },);
  }
}
