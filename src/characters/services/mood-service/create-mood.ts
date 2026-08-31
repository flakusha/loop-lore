// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Mood Service — createMood dispatcher
 *
 * Initializes mood state for a character (guards duplicates).
 */
import { randomUUID, } from "node:crypto";
import { jsonStringifyOr, } from "../../../utils";
import { guardNotExists, } from "../shared-service-utils";
import { getMood, } from "./get-mood";
import type { CreateMoodOpts, MoodServiceContext, } from "./types";

/** Arguments for {@link createMood}. */
export interface CreateMoodArgs {
  thisL: MoodServiceContext;
  opts: CreateMoodOpts;
}

/**
 * Create or initialize mood state for a character.
 * @param args.thisL - The mood service instance
 * @param root0
 * @param root0.thisL
 * @param args.opts - Mood creation options
 * @param root0.opts
 * @returns Created mood ID
 */
export async function createMood(
  { thisL, opts, }: CreateMoodArgs,
): Promise<string> {
  const existing = await getMood({ thisL, actorId: opts.actorId, worldId: opts.worldId, },);
  guardNotExists(existing, "Mood", opts.actorId,);

  const id = randomUUID();
  const now = new Date().toISOString();

  await thisL.db
    .insertInto("character_mood",)
    .values({
      id,
      actor_id: opts.actorId,
      world_id: opts.worldId ?? null,
      happiness: opts.happiness ?? 50,
      base_mood: opts.baseMood ?? "neutral",
      current_mood: opts.baseMood ?? "neutral",
      mood_stability: opts.moodStability ?? 0.5,
      expression_modifiers: jsonStringifyOr({
        tone: 0,
        verbosity: 0,
        cooperation: 0,
        warmth: 0,
        humor: 0,
        formality: 0,
      },),
      last_mood_change: now,
      created_at: now,
      updated_at: now,
    },)
    .execute();

  return id;
}
