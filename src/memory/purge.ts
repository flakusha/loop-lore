// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory auto-purge service.
 *
 * Detects stale memories (not accessed in N chats) and optionally deletes them.
 * Decays memory strength based on access patterns.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db";
import { getLogger, } from "../logger";
import type { PurgeConfig, } from "./types";

function getLog() {
  return getLogger().child({ module: "memory-purge", },);
}

/** Default: mark stale after 10 chats without reference. */
const DEFAULT_STALE_AFTER_CHATS = 10;

/**
 * Apply decay to memory confidence.
 * Reduces confidence by decayRate for memories that were accessed.
 */
/**
 * Apply time-based decay to memory strength.
 *
 * Uses per-memory `decay_rate` and elapsed time since `last_accessed_at`
 * to reduce `strength`. Memories with higher decay_rate fade faster.
 *
 * Formula: strength -= decay_rate × elapsed_days
 * Strength is clamped to [0, 1].
 *
 * @param db - Kysely instance
 * @param opts - Optional overrides
 * @returns Number of memories affected
 */
export async function applyDecay(
  db: Kysely<DB>,
  opts: { now?: Date } = {},
): Promise<number> {
  const now = opts.now ?? new Date();

  const memories = await db
    .selectFrom("actor_memories",)
    .select(["id", "strength", "decay_rate", "last_accessed_at",],)
    .where("strength", ">", 0,)
    .where("decay_rate", ">", 0,)
    .execute();

  let affected = 0;
  for (const mem of memories) {
    const lastAccessed = mem.last_accessed_at ?? mem.id; // fallback to creation
    const elapsedMs = now.getTime() - new Date(lastAccessed,).getTime();
    const elapsedDays = Math.max(0, elapsedMs / (1000 * 60 * 60 * 24),);
    const decay = mem.decay_rate * elapsedDays;
    const newStrength = Math.max(0, mem.strength - decay,);

    if (newStrength !== mem.strength) {
      await db
        .updateTable("actor_memories",)
        .set({ strength: newStrength, },)
        .where("id", "=", mem.id,)
        .execute();
      affected++;
    }
  }

  if (affected > 0) {
    getLog().info("Applied memory decay", { affected, },);
  }
  return affected;
}

/**
 * Mark memories as stale or delete them based on purge config.
 * Stale = not accessed in the last N chats.
 */
export async function purgeStaleMemories(
  db: Kysely<DB>,
  config: Partial<PurgeConfig> = {},
): Promise<{ stale: number; deleted: number }> {
  const {
    staleAfterChats = DEFAULT_STALE_AFTER_CHATS,
    hardDelete = false,
    minConfidence = 0.2,
    minStrength = 0.1,
  } = config;

  const staleThreshold = new Date(Date.now() - staleAfterChats * 24 * 60 * 60 * 1000,).toISOString();

  if (hardDelete) {
    const toDelete = await db
      .selectFrom("actor_memories",)
      .select("id",)
      .where((eb,) =>
        eb.or([
          eb("last_accessed_at", "<", staleThreshold,),
          eb("last_accessed_at", "is", null,),
        ],)
      )
      .where("confidence", "<", minConfidence,)
      .where("strength", "<", minStrength,)
      .execute();

    let deleted = 0;
    for (const mem of toDelete) {
      await db.deleteFrom("actor_memories",).where("id", "=", mem.id,).execute();
      deleted++;
    }

    if (deleted > 0) {
      getLog().info("Purged stale memories", { deleted, staleAfterChats, },);
    }
    return { stale: deleted, deleted, };
  }

  // Soft: mark by reducing confidence to near-zero
  const toMark = await db
    .selectFrom("actor_memories",)
    .select("id",)
    .where((eb,) =>
      eb.or([
        eb("last_accessed_at", "<", staleThreshold,),
        eb("last_accessed_at", "is", null,),
      ],)
    )
    .where("confidence", ">", minConfidence,)
    .where("strength", "<", minStrength,)
    .execute();

  let stale = 0;
  for (const mem of toMark) {
    await db
      .updateTable("actor_memories",)
      .set({ confidence: 0.01, },)
      .where("id", "=", mem.id,)
      .execute();
    stale++;
  }

  if (stale > 0) {
    getLog().info("Marked memories as stale", { stale, staleAfterChats, },);
  }
  return { stale, deleted: 0, };
}

/**
 * Update last_accessed_at and boost strength when a memory is used in a prompt.
 *
 * Access-recency boost: strength is increased by 0.1 (clamped to 1.0)
 * when a memory is accessed, making recently-used memories more durable.
 *
 * @param db - Kysely instance
 * @param memoryId - ID of the memory to touch
 */
export async function touchMemory(
  db: Kysely<DB>,
  memoryId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .updateTable("actor_memories",)
    .set((eb,) => ({
      last_accessed_at: now,
      strength: eb("strength", "+", 0.1,),
    }))
    .where("id", "=", memoryId,)
    .execute();
}
