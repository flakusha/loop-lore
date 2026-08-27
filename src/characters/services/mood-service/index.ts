// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Mood Service — factory + merged public API
 *
 * Splits the former `MoodService` class into standalone dispatcher functions
 * (one file per method) threaded with an explicit `thisL` context, reassembled
 * here by a factory.
 *
 * `MoodService` is a single source of truth: the interface IS the API type and
 * the factory value shares the same exported name (TS declaration merge), so
 * there is no hand-rolled parallel interface to keep in sync. Callers interact
 * through one name:
 *
 * ```ts
 * const mood = MoodService(db);          // factory value
 * const svc: MoodService = MoodService(db);   // interface type
 * ```
 *
 * The `owo(a, b, c)` → `owo({ thisL = this, a, b, c })` refactor shape: each
 * method became a dispatcher taking its extracted arguments plus the service
 * context as `thisL`.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { applyHappinessDelta, } from "./apply-happiness-delta";
import { createMood, } from "./create-mood";
import { getEvents, } from "./get-events";
import { getMood, } from "./get-mood";
import { logEvent, } from "./log-event";
import type {
  MoodService as MoodServiceIface,
  MoodServiceContext,
} from "./types";
import { updateMood, } from "./update-mood";

/** Public API type — merged with the factory value below. */
// The empty interface is intentional: it merges the `MoodService` factory
// value with a same-named type so one name is both API type and constructor.
export interface MoodService extends MoodServiceIface {}

export type {
  CreateMoodOpts,
  LogMoodEventOpts,
  MoodDeps,
  MoodEventRow,
  MoodState,
  UpdateMoodOpts,
} from "./types";

/** Re-export the happiness mapping for callers that need it. */
export { happinessToMood, } from "./happiness-to-mood";

/**
 * Create a MoodService instance.
 *
 * @param db - The database handle (matches the former `new MoodService(db)`)
 * @returns A MoodService bound to the given database
 */
export function MoodService(db: Kysely<DB>,): MoodService {
  const self: MoodServiceContext = {
    db,
    getMood: (actorId, worldId,) => getMood({ thisL: self, actorId, worldId, },),
    createMood: (opts,) => createMood({ thisL: self, opts, },),
    updateMood: (actorId, worldId, opts,) => updateMood({ thisL: self, actorId, worldId, opts, },),
    applyHappinessDelta: (actorId, worldId, delta,) => applyHappinessDelta({ thisL: self, actorId, worldId, delta, },),
    logEvent: (opts,) => logEvent({ thisL: self, opts, },),
    getEvents: (actorId, worldId, limit,) => getEvents({ thisL: self, actorId, worldId, limit, },),
  };
  return self;
}
