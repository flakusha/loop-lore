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
export async function applyDecay(
  db: Kysely<DB>,
  opts: { decayRate?: number } = {},
): Promise<number> {
  const decayRate = opts.decayRate ?? 0.01;

  // Reduce confidence for accessed memories
  const accessed = await db
    .selectFrom("actor_memories",)
    .select(["id", "confidence",],)
    .where("last_accessed_at", "is not", null,)
    .where("confidence", ">", 0,)
    .execute();

  let affected = 0;
  for (const mem of accessed) {
    const newConf = Math.max(0, mem.confidence - decayRate,);
    await db
      .updateTable("actor_memories",)
      .set({ confidence: newConf, },)
      .where("id", "=", mem.id,)
      .execute();
    affected++;
  }

  if (affected > 0) {
    getLog().info("Applied memory decay", { affected, decayRate, },);
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
 * Update last_accessed_at when a memory is used in a prompt.
 */
export async function touchMemory(
  db: Kysely<DB>,
  memoryId: string,
): Promise<void> {
  await db
    .updateTable("actor_memories",)
    .set({ last_accessed_at: new Date().toISOString(), },)
    .where("id", "=", memoryId,)
    .execute();
}
