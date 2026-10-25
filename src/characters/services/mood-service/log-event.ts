// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Mood Service — logEvent dispatcher
 *
 * Records a mood event and (optionally) applies its happiness delta.
 */
import { randomUUID, } from "node:crypto";
import { withTransaction, } from "../shared-service-utils";
import { applyHappinessDelta, } from "./apply-happiness-delta";
import type { LogMoodEventOpts, MoodServiceContext, } from "./types";

/** Arguments for {@link logEvent}. */
export interface LogEventArgs {
  thisL: MoodServiceContext;
  opts: LogMoodEventOpts;
}

/**
 * Log a mood event.
 * @param args.thisL - The mood service instance
 * @param root0
 * @param root0.thisL
 * @param args.opts - Event options
 * @param root0.opts
 * @returns The created event ID
 */
export async function logEvent(
  { thisL, opts, }: LogEventArgs,
): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();

  // withTransaction reuses the ambient transaction when thisL.db is already
  // a trx (e.g. encounter fan-out runs under the caller's transaction) — a
  // raw .transaction() there throws and the caller's best-effort leg would
  // silently drop the event.
  await withTransaction(thisL.db, async (trx,) => {
    await trx
      .insertInto("mood_events",)
      .values({
        id,
        actor_id: opts.actorId,
        world_id: opts.worldId ?? null,
        event_type: opts.eventType,
        happiness_delta: opts.happinessDelta ?? 0,
        mood_override: opts.moodOverride ?? null,
        source: opts.source ?? "unknown",
        source_id: opts.sourceId ?? null,
        created_at: now,
      },)
      .execute();

    const trxContext = { ...thisL, db: trx, } as MoodServiceContext;
    // Apply the happiness delta (best-effort: a missing mood row must not
    // roll back the event insert, so encounters can still fan out mood events).
    if (opts.happinessDelta !== undefined) {
      try {
        await applyHappinessDelta({
          thisL: trxContext,
          actorId: opts.actorId,
          worldId: opts.worldId,
          delta: opts.happinessDelta,
        },);
      } catch {
        // no mood row yet; event still recorded
      }
    }
  },);

  return id;
}
