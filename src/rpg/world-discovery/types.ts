// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/world-discovery/types.ts — discovery/trade shapes
 *
 * Pure shapes plus the one `withTables` helper, mirroring
 * `src/rpg/world-travel/types.ts`. The two tables are declared here
 * rather than in `src/db/schema*.ts` because those files are GENERATED
 * from the migrations (`bun run db:sync-types`) — editing them by hand is
 * forbidden, and the orchestrator regenerates them after
 * `037_world_discovery_trade_events` lands.
 */
import type { Generated, Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

/** `world_event_log` — append-only, world-scoped simulation events. */
export interface WorldEventLog {
  id: Generated<string>;
  world_id: string;
  event_type: string;
  /** Location id for `location:discovered`, party id for `trade:route`. */
  subject_id: string | null;
  /** The actor that caused it, when there is one. */
  actor_id: string | null;
  payload: Generated<string>;
  tick_index: number;
  /** UNIQUE — the idempotency key that makes a replayed tick a no-op. */
  dedupe_key: string;
  created_at: Generated<string>;
}

/** `location_discovery` — one actor's exploration progress at one location. */
export interface LocationDiscovery {
  world_id: string;
  location_id: string;
  actor_id: string;
  progress: Generated<number>;
  /** The decay clock AND the replay latch — see migration 031. */
  last_explored_tick: Generated<number>;
  discovered: Generated<number>;
  discovered_tick: number | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

/** The tables this module adds on top of the generated `DB`.
 *
 * A type alias, not an interface: `Kysely.withTables` constrains its
 * argument to `Record<string, Record<string, any>>`, and only a type
 * alias gets the implicit index signature an interface never has.
 */
export type DiscoveryTables = {
  world_event_log: WorldEventLog;
  location_discovery: LocationDiscovery;
};

/** A `Kysely<DB>` widened with the discovery tables. */
export type DiscoveryDb = Kysely<DB & DiscoveryTables>;

/**
 * Widen a plain `Kysely<DB>` with the discovery tables.
 * @param db the scheduler's database handle
 * @returns the same handle, typed against the discovery tables
 */
export function discoveryDb(db: Kysely<DB>,): DiscoveryDb {
  return db.withTables<DiscoveryTables>();
}

/** The event a location finished charting. */
export const LOCATION_DISCOVERED = "location:discovered";

/** The event a moving convoy leaves behind it. */
export const TRADE_ROUTE = "trade:route";

/** One event to append. `dedupeKey` is required — see `events.ts`. */
export interface WorldEventInput {
  worldId: string;
  eventType: string;
  subjectId: string | null;
  actorId: string | null;
  tick: number;
  payload: Record<string, unknown>;
  dedupeKey: string;
}

/** One row of the event log, as the admin listing returns it. */
export interface WorldEventRow {
  id: string;
  world_id: string;
  event_type: string;
  subject_id: string | null;
  actor_id: string | null;
  payload: string;
  tick_index: number;
  created_at: string;
}

/** Admin listing page. `page` is 1-based, like the other admin lists. */
export interface WorldEventListQuery {
  worldId: string;
  eventType?: string;
  page: number;
  pageSize: number;
}

/** One page of events plus the total row count. */
export interface WorldEventPage {
  data: WorldEventRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** Outcome of one discovery tick. */
export interface DiscoveryResult {
  /** Location/actor pairs whose progress advanced this tick. */
  explored: number;
  /** Progress rows that hit the threshold for the first time. */
  discovered: number;
  /** Events actually appended — dedupe-filtered, so 0 on a replay. */
  events: number;
}

/** Outcome of one trade tick. */
export interface TradeResult {
  /** Convoys found in motion this tick. */
  convoys: number;
  /** Events actually appended — dedupe-filtered, so 0 on a replay. */
  events: number;
}
