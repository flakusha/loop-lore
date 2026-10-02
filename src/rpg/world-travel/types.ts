// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/world-travel/types.ts — Travel/migration shapes
 *
 * Pure shapes plus the one `withTables` helper. The three tables are
 * declared here rather than in `src/db/schema*.ts` because those files
 * are GENERATED from the migrations (`bun run db:sync-types`) — editing
 * them by hand is forbidden, and the orchestrator regenerates them
 * after `036_world_travel_simulation` lands.
 */
import type { Generated, Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

/** `travel_parties` — world-scoped party, its route, and its cursor. */
export interface TravelParties {
  id: Generated<string>;
  world_id: string;
  name: string;
  kind: string;
  cadence: string;
  route: string;
  route_index: number;
  steps_per_tick: number;
  travel_progress: number;
  current_location_id: string | null;
  current_tick: number;
  status: string;
  blocked_until_tick: number;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

/** `npc_migrations` — one NPC's relocation schedule. */
export interface NpcMigrations {
  id: Generated<string>;
  world_id: string;
  actor_id: string;
  origin_location_id: string | null;
  destination_location_id: string | null;
  depart_tick: number;
  arrive_tick: number;
  cadence: string;
  status: string;
  last_depart_tick: number;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

/** `world_travel_budget` — fractional spend ledger, one row per world. */
export interface WorldTravelBudget {
  world_id: string;
  spent: number;
  ceiling: number;
  window_start_tick: number;
  updated_at: Generated<string>;
}

/** The tables this module adds on top of the generated `DB`.
 *
 * A type alias, not an interface: `Kysely.withTables` constrains its
 * argument to `Record<string, Record<string, any>>`, and only a type
 * alias gets the implicit index signature an interface never has.
 */
export type TravelTables = {
  travel_parties: TravelParties;
  npc_migrations: NpcMigrations;
  world_travel_budget: WorldTravelBudget;
};

/** A `Kysely<DB>` widened with the travel tables. */
export type TravelDb = Kysely<DB & TravelTables>;

/**
 * Widen a plain `Kysely<DB>` with the travel tables.
 * @param db the scheduler's database handle
 * @returns the same handle, typed against the travel tables
 */
export function travelDb(db: Kysely<DB>,): TravelDb {
  return db.withTables<TravelTables>();
}

/** Injected per-tick inputs. No wall clock, no ambient RNG. */
export interface TravelContext {
  /** Tick instant (epoch ms) written to `updated_at`, injected so a replay
   * writes byte-identical rows. */
  nowMs: number;
  /** Seedable RNG for the tick (`docs/spec/autonomy-determinism.md`).
   * Threaded on every travel call; the travel step itself draws nothing
   * — it is entirely the deterministic tier (ordering, cursors, budget),
   * which per that spec "needs no RNG at all". The handle is here so the
   * nondeterministic tier (route branching, encounter triggers) lands
   * without changing a single signature. */
  rng: () => number;
  /** Budget ceiling in budget units for this world's window. */
  ceiling: number;
  /** Locations claimed by an arrival already applied this tick.
   * Owned by the dispatch and shared with `advancePartyTravel` so a
   * party and an NPC contending for the same location resolve the same
   * way. Absent → no prior arrivals, i.e. travel runs alone. */
  claims?: Set<string>;
}

/** What one billable unit of travel work was. */
export interface TravelAction {
  /** Which state machine moved. */
  kind: "party_step" | "npc_depart" | "npc_arrive";
  /** Party id for `party_step`; actor id otherwise. */
  subjectId: string;
  /** The tick the action was applied on. */
  tick: number;
  /** Budget units charged. Always `ACTION_COST` today. */
  cost: number;
}

/** Outcome of one travel tick. Actions are in application order. */
export interface TravelResult {
  /** State changes applied, in the order they were applied. */
  actions: TravelAction[];
  /** Arrivals that lost a location collision and deferred to a later tick. */
  deferred: number;
  /** True when the tick stopped early because the budget could not fund
   * another action. Every action listed above was charged. */
  budgetExhausted: boolean;
}
