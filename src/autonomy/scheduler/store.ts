// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/autonomy/scheduler/store.ts — SimulationState persistence
 *
 * All `world_simulation_state` I/O for the scheduler, split out so
 * ./index.ts stays a loop, not a pile of queries. The store is a
 * thin per-instance wrapper — no caching, no singleton: every method
 * reads or writes the row so a fresh process sees the same cursor.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { toDate, } from "../../utils/date";
import type { SimulationState, WorldScheduleEntry, } from "./types";

/** Chat id when a world has no chat row — the config resolver
 *  short-circuits on it instead of doing a pointless lookup.
 */
export const NO_CHAT = "__none__";

/** Fields the scheduler writes on every upsert. */
export type StateWrite = {
  paused: number;
  next_tick_at: string;
  last_run_at: string | null;
  last_error: string | null;
  tick_count: number;
};

/** Read + write access to the per-world simulation cursor. */
export class SimulationStore {
  readonly #db: Kysely<DB>;

  constructor(db: Kysely<DB>,) {
    this.#db = db;
  }

  /**
   * Read a persisted cursor, or synthesize a never-ticked one for a
   * world with no row. A world with no row is immediately due:
   * autonomy must not require an opt-in seed row per world.
   * @param worldId
   */
  async load(worldId: string,): Promise<SimulationState> {
    const row = await this.#db
      .selectFrom("world_simulation_state",)
      .selectAll()
      .where("world_id", "=", worldId,)
      .executeTakeFirst();

    if (row) { return row; }
    const epoch = toDate(0,).toISOString();
    return {
      world_id: worldId,
      next_tick_at: epoch,
      paused: 0,
      last_run_at: null,
      last_error: null,
      tick_count: 0,
      updated_at: epoch,
    };
  }

  /**
   * Due worlds at `nowMs`, ordered `(next_tick_at ASC, world_id ASC)`.
   * The id tie-break makes the order total, so the dispatch sequence
   * is byte-identical after a restart (see ./README.md).
   * @param nowMs
   */
  async dueWorlds(nowMs: number,): Promise<WorldScheduleEntry[]> {
    const iso = toDate(nowMs,).toISOString();
    const rows = await this.#db
      .selectFrom("worlds",)
      .leftJoin("world_simulation_state", "world_simulation_state.world_id", "worlds.id",)
      .select([
        "worlds.id as world_id",
        "world_simulation_state.next_tick_at",
        "world_simulation_state.paused",
        "world_simulation_state.last_run_at",
        "world_simulation_state.last_error",
        "world_simulation_state.tick_count",
      ],)
      .where((eb,) =>
        eb.or([
          // No cursor row at all: due immediately. Selecting the due set
          // from world_simulation_state alone meant a world that had never
          // ticked was never selected, so nothing ever created its row and
          // the loop was dead for every new world until an admin paused or
          // stepped it. `load` already synthesizes an epoch cursor for that
          // case; the due set has to agree with it.
          eb("world_simulation_state.world_id", "is", null,),
          eb.and([
            eb("world_simulation_state.paused", "=", 0,),
            eb("world_simulation_state.next_tick_at", "<=", iso,),
          ],),
        ],)
      )
      .orderBy("world_simulation_state.next_tick_at", "asc",)
      .orderBy("worlds.id", "asc",)
      .execute();

    const epoch = toDate(0,).toISOString();
    return rows.map((row,) => ({
      worldId: row.world_id,
      state: {
        world_id: row.world_id,
        next_tick_at: row.next_tick_at ?? epoch,
        paused: row.paused ?? 0,
        last_run_at: row.last_run_at ?? null,
        last_error: row.last_error ?? null,
        tick_count: row.tick_count ?? 0,
        updated_at: epoch,
      },
    }));
  }

  /**
   * Upsert the cursor. `paused` is always part of the write so a
   * concurrent admin pause is not lost when a tick lands.
   * @param worldId
   * @param values
   */
  async write(worldId: string, values: StateWrite,): Promise<void> {
    await this.#db
      .insertInto("world_simulation_state",)
      .values({ world_id: worldId, ...values, },)
      .onConflict((oc,) => oc.column("world_id",).doUpdateSet(values,))
      .execute();
  }

  /**
   * Set the paused flag, creating the row when absent. The cursor
   * fields are carried over untouched — pause/resume must not move
   * the schedule.
   * @param worldId
   * @param paused 1 = paused, 0 = running.
   */
  async setPaused(worldId: string, paused: number,): Promise<SimulationState> {
    const state = await this.load(worldId,);
    await this.write(worldId, {
      paused,
      next_tick_at: state.next_tick_at,
      last_run_at: state.last_run_at,
      last_error: state.last_error,
      tick_count: state.tick_count,
    },);

    return this.load(worldId,);
  }

  /**
   * The world's chat for config resolution, or `NO_CHAT` when it has
   * none. Oldest-first, id-tiebroken, so repeated calls in one
   * process always resolve the same chat.
   * @param worldId
   */
  async chatIdFor(worldId: string,): Promise<string> {
    const row = await this.#db
      .selectFrom("chats",)
      .select("id",)
      .where("world_id", "=", worldId,)
      .orderBy("created_at", "asc",)
      .orderBy("id", "asc",)
      .limit(1,)
      .executeTakeFirst();

    return row?.id ?? NO_CHAT;
  }
}
