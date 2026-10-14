// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 260
// Cohesive single-purpose module: the exported types and the one service
// factory that returns them cannot be separated without splitting the public
// contract from its implementation.

/**
 * src/worlds/timescale.ts — epoch + time-scale engine
 *
 * One row per world (`world_timescale`, migration 052) carries the current epoch
 * label and the world clock: `scale_size` world-minutes elapse per each
 * real-minute passed to `advance`, and `advanced_minutes` accumulates
 * them. There is no other canonical world-time column —
 * `location_states.time_of_day` is a coarse per-location period label
 * and `world_simulation_state.next_tick_at` is the real-time scheduler
 * due cursor — so this table IS the world clock; `currentWorldTime`
 * derives day/hour/minute from `advanced_minutes` against `anchor_at`,
 * the real instant the clock reads day 1 00:00.
 *
 * Epoch first-seen history is appended to `world_timescale_history` on
 * every epoch change (and on default-row creation) so `listEpochs` can
 * report distinct epochs with the instant each began.
 */
import type { Kysely, Selectable, } from "kysely";
import type { DB, } from "../db/schema";
import type { WorldTimescale, } from "../db/schema-story";
import { getLogger, } from "../logger";
import { findWorld, } from "./lookup";

/** Epoch label used when a world's timescale row is first created. */
export const DEFAULT_EPOCH = "first_age";

/** World-minutes elapsed per real-minute at the default scale (1:1 hour). */
export const DEFAULT_SCALE_SIZE = 60;

/** Maximum characters accepted for an epoch label. */
export const MAX_EPOCH_LENGTH = 64;

/** World-minutes in a world-day. */
const MINUTES_PER_DAY = 1440;

/** Raised for unknown worlds and invalid epoch/scale/advance inputs. */
export class TimescaleError extends Error {
  override readonly name = "TimescaleError";
}

/** A persisted `world_timescale` row as returned by SELECT (defaults unwrapped). */
export type TimescaleRow = Selectable<WorldTimescale>;

/** Injectable clock — returns the instant stamped on writes. */
export type TimescaleClock = () => Date;

/** Options for `createTimescaleService`. */
export interface TimescaleOptions {
  /** Clock used for `anchor_at`/`*_at` stamps. Defaults to wall clock. */
  now?: TimescaleClock;
}

/** Patch accepted by `setTimescale`; every field optional. */
export interface TimescalePatch {
  /** New epoch label (trimmed, 1–`MAX_EPOCH_LENGTH` chars). */
  epoch?: string;
  /** New scale: world-minutes per real-minute; must be > 0. */
  scaleSize?: number;
}

/** Outcome of one `advance` call. */
export interface AdvanceResult {
  /** World-minutes this call added (`realMinutes × scale_size`). */
  worldMinutes: number;
  /** World-minutes accumulated on the world clock after the advance. */
  advancedMinutes: number;
  /** Scale in effect for this advance. */
  scaleSize: number;
  /** Epoch in effect after the advance. */
  epoch: string;
}

/** Distinct epoch with the instant it was first entered. */
export interface EpochSummary {
  epoch: string;
  /** ISO instant the world first entered this epoch. */
  firstSeenAt: string;
}

/** The world clock read out as calendar fields. Day 1 00:00 is the
 * anchor; `advancedMinutes` counts from there. */
export interface WorldTime {
  epoch: string;
  scaleSize: number;
  /** Stored anchor instant (real time of day-1 00:00). */
  anchorAt: string;
  /** World-minutes elapsed since the anchor. */
  advancedMinutes: number;
  /** 1-based world-day. */
  day: number;
  /** Hour within the world-day, 0–23. */
  hour: number;
  /** Minute within the hour, 0–59. */
  minute: number;
}

/**
 * Create the epoch + time-scale service for one database.
 * @param db — Kysely handle typed against the generated schema.
 * @param options — injectables; `now` makes writes deterministic.
 * @returns Service with `getTimescale`, `setTimescale`, `advance`,
 *   `currentWorldTime`, `listEpochs`.
 */
export function createTimescaleService(db: Kysely<DB>, options: TimescaleOptions = {},) {
  const now: TimescaleClock = options.now ?? (() => new Date());

  /**
   * Fetch the world's timescale row, creating the default row (and its
   * first-seen history entry) when absent.
   * @param worldId — the world to read or initialize.
   * @returns The persisted row.
   * @throws {TimescaleError} when the world does not exist.
   */
  async function ensureRow(worldId: string,): Promise<TimescaleRow> {
    const existing = await db
      .selectFrom("world_timescale",)
      .selectAll()
      .where("world_id", "=", worldId,)
      .executeTakeFirst();

    if (existing) { return existing; }

    const world = await findWorld(db, worldId,);
    if (world === undefined) {
      throw new TimescaleError(`world "${worldId}" does not exist`,);
    }

    const stamp = now().toISOString();
    await db.insertInto("world_timescale",).values({
      world_id: worldId,
      epoch: DEFAULT_EPOCH,
      scale_size: DEFAULT_SCALE_SIZE,
      advanced_minutes: 0,
      anchor_at: stamp,
      created_at: stamp,
      updated_at: stamp,
    },).execute();

    await db
      .insertInto("world_timescale_history",)
      .values({ world_id: worldId, epoch: DEFAULT_EPOCH, changed_at: stamp, },)
      .execute();

    getLogger().debug("created default world_timescale row", { worldId, epoch: DEFAULT_EPOCH, },);

    const created = await db
      .selectFrom("world_timescale",)
      .selectAll()
      .where("world_id", "=", worldId,)
      .executeTakeFirstOrThrow();

    return created;
  }

  return {
    /**
     * Read a world's timescale row, creating the default row if absent.
     * @param worldId — the world to read.
     * @returns The persisted row (defaults: `first_age`, scale 60).
     * @throws {TimescaleError} when the world does not exist.
     */
    async getTimescale(worldId: string,): Promise<TimescaleRow> {
      return ensureRow(worldId,);
    },

    /**
     * Upsert the world's epoch and/or scale after validation. An epoch
     * change appends a `world_timescale_history` first-seen row; an
     * empty patch writes nothing and returns the current row.
     * @param worldId — the world to update.
     * @param patch — optional `epoch` and/or `scaleSize`.
     * @returns The row after the upsert.
     * @throws {TimescaleError} when the world does not exist, `epoch`
     *   is empty or longer than `MAX_EPOCH_LENGTH`, or `scaleSize` is
     *   not a finite number > 0.
     */
    async setTimescale(worldId: string, patch: TimescalePatch,): Promise<TimescaleRow> {
      const current = await ensureRow(worldId,);
      const update: { epoch?: string; scale_size?: number; updated_at?: string } = {};

      if (patch.epoch !== undefined) {
        const epoch = patch.epoch.trim();
        if (epoch.length === 0) {
          throw new TimescaleError("epoch must be a non-empty string",);
        }

        if (epoch.length > MAX_EPOCH_LENGTH) {
          throw new TimescaleError(`epoch must be at most ${MAX_EPOCH_LENGTH} characters`,);
        }

        update.epoch = epoch;
      }

      if (patch.scaleSize !== undefined) {
        if (typeof patch.scaleSize !== "number" || !Number.isFinite(patch.scaleSize,) || patch.scaleSize <= 0) {
          throw new TimescaleError("scaleSize must be a finite number greater than 0",);
        }

        update.scale_size = patch.scaleSize;
      }

      if (Object.keys(update,).length > 0) {
        update.updated_at = now().toISOString();
        await db.updateTable("world_timescale",).set(update,).where("world_id", "=", worldId,).execute();
        if (update.epoch !== undefined && update.epoch !== current.epoch) {
          await db
            .insertInto("world_timescale_history",)
            .values({ world_id: worldId, epoch: update.epoch, changed_at: update.updated_at, },)
            .execute();
        }
      }

      return ensureRow(worldId,);
    },

    /**
     * Advance the world clock by `realMinutes` real-minutes, i.e.
     * `realMinutes × scale_size` world-minutes, persisted to
     * `world_timescale.advanced_minutes`.
     * @param worldId — the world whose clock advances.
     * @param realMinutes — real-minutes to advance; must be ≥ 0.
     * @returns The applied world-minutes and the resulting clock state.
     * @throws {TimescaleError} when the world does not exist or
     *   `realMinutes` is not a finite number ≥ 0.
     */
    async advance(worldId: string, realMinutes: number,): Promise<AdvanceResult> {
      if (typeof realMinutes !== "number" || !Number.isFinite(realMinutes,) || realMinutes < 0) {
        throw new TimescaleError("realMinutes must be a finite number ≥ 0",);
      }

      const row = await ensureRow(worldId,);
      const worldMinutes = realMinutes * row.scale_size;
      const advancedMinutes = row.advanced_minutes + worldMinutes;
      await db
        .updateTable("world_timescale",)
        .set({ advanced_minutes: advancedMinutes, updated_at: now().toISOString(), },)
        .where("world_id", "=", worldId,)
        .execute();

      return { worldMinutes, advancedMinutes, scaleSize: row.scale_size, epoch: row.epoch, };
    },

    /**
     * Read the world clock as day/hour/minute. Day 1 00:00 is the
     * anchor instant stored on the row; `advancedMinutes` world-minutes
     * have elapsed since.
     * @param worldId — the world to read.
     * @returns Epoch, scale, anchor, elapsed world-minutes and the
     *   derived day (1-based), hour (0–23) and minute (0–59).
     * @throws {TimescaleError} when the world does not exist.
     */
    async currentWorldTime(worldId: string,): Promise<WorldTime> {
      const row = await ensureRow(worldId,);
      const total = row.advanced_minutes;
      return {
        epoch: row.epoch,
        scaleSize: row.scale_size,
        anchorAt: row.anchor_at,
        advancedMinutes: total,
        day: Math.floor(total / MINUTES_PER_DAY,) + 1,
        hour: Math.floor((total % MINUTES_PER_DAY) / 60,),
        minute: Math.floor(total % 60,),
      };
    },

    /**
     * List the world's distinct epochs in first-entered order, from the
     * append-only `world_timescale_history` ledger. The default epoch
     * row (and history entry) is created when absent.
     * @param worldId — the world whose epoch history to read.
     * @returns Epochs with the instant each was first seen.
     * @throws {TimescaleError} when the world does not exist.
     */
    async listEpochs(worldId: string,): Promise<EpochSummary[]> {
      await ensureRow(worldId,);
      const rows = await db
        .selectFrom("world_timescale_history",)
        .select((eb,) => ["epoch", eb.fn.min("changed_at",).as("first_seen_at",),])
        .where("world_id", "=", worldId,)
        .groupBy("epoch",)
        .orderBy("first_seen_at", "asc",)
        .execute();

      return rows.map((row,) => ({ epoch: row.epoch, firstSeenAt: row.first_seen_at, }));
    },
  };
}

/** The epoch + time-scale service. */
export type TimescaleService = ReturnType<typeof createTimescaleService>;
