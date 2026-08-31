// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Mood Service — logEvent dispatcher
 *
 * Records a mood event and (optionally) applies its happiness delta.
 */
import { randomUUID, } from "node:crypto";
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

  await thisL.db
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

  // Apply the happiness delta
  if (opts.happinessDelta !== undefined) {
    await applyHappinessDelta({
      thisL,
      actorId: opts.actorId,
      worldId: opts.worldId,
      delta: opts.happinessDelta,
    },);
  }

  return id;
}
