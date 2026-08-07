/**
 * Character Mood Service — types
 *
 * Shared types for mood state, creation/update/event inputs, and the
 * MoodService interface (the single source of truth for the API shape).
 */
import type { Kysely, Selectable, } from "kysely";
import type { DB, } from "../../../db/schema";
import type { MoodCreateInput, MoodEventInput, MoodUpdateInput, } from "../../../validation/schemas";

/** Options for creating mood state (body + actorId from params) */
export type CreateMoodOpts = MoodCreateInput & { actorId: string };
/** Options for updating mood */
export type UpdateMoodOpts = MoodUpdateInput;
/** Options for logging a mood event (body + actorId from params) */
export type LogMoodEventOpts = MoodEventInput & { actorId: string };

/** Mood state with expression modifiers */
export interface MoodState {
  id: string;
  actorId: string;
  worldId: string | null;
  happiness: number;
  baseMood: string;
  currentMood: string;
  moodStability: number;
  expressionModifiers: Record<string, number>;
  lastMoodChange: string;
}

/**
 * The mood event row shape returned by {@link MoodService.getEvents}.
 * Derived from the `mood_events` DB table (single source of truth —
 * mirrors `.selectAll()` of the Kysely builder).
 */
export type MoodEventRow = Selectable<DB["mood_events"]>;

/** The database handle a mood dispatcher operates on (`thisL.db`). */
export interface MoodDeps {
  db: Kysely<DB>;
}

/**
 * Character Mood Service — public API (single source of truth).
 *
 * The factory value `MoodService` (see `index.ts`) is declaration-merged with
 * this interface, so a single exported name is both the type and the
 * constructor/factory. Do not hand-roll a parallel interface alongside it.
 */
export interface MoodService {
  getMood(actorId: string, worldId?: string,): Promise<MoodState | undefined>;
  createMood(opts: CreateMoodOpts,): Promise<string>;
  updateMood(actorId: string, worldId: string | undefined, opts: UpdateMoodOpts,): Promise<void>;
  applyHappinessDelta(actorId: string, worldId: string | undefined, delta: number,): Promise<number>;
  logEvent(opts: LogMoodEventOpts,): Promise<string>;
  getEvents(actorId: string, worldId?: string, limit?: number,): Promise<MoodEventRow[]>;
}

/**
 * The full service instance passed to dispatchers as `thisL`.
 * Extends the public API with the db handle so dispatch bodies can reach it.
 */
export type MoodServiceContext = MoodService & MoodDeps;
