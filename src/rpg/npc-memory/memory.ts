// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NPC memory record/recall/reinforcement and the NPC relationship model.
 *
 * Every write goes through Kysely with an injected `db` and an explicit
 * `now`, so all timestamps are deterministic under test. No randomness here
 * — decay lives in ./decay.ts.
 */
import type { Kysely, Selectable, } from "kysely";
import type { MemoryType, NpcRelationshipType, } from "../../db/enums-story";
import type { DB, } from "../../db/schema";
import { jsonStringifyOr, uid, } from "../../utils";
import { getRpgLog, parseJsonField, } from "../shared/rpg-service-utils";

/** Raw `npc_memories` row. */
export type NpcMemoryRow = Selectable<DB["npc_memories"]>;
/** Raw `npc_relationships` row; `history` stays a JSON string. */
export type NpcRelationshipRow = Selectable<DB["npc_relationships"]>;

/** One entry in `npc_relationships.history`. */
export interface RelationshipHistoryEntry {
  at: string;
  delta: number;
}

/** Fields accepted when recording a memory; the rest have defaults. */
export interface RecordMemoryInput {
  content: string;
  memoryType?: MemoryType;
  importance?: number;
  emotionalImpact?: number;
  participants?: string[];
  locationId?: string | null;
  decayRate?: number;
  shared?: boolean;
  expiresAt?: string | null;
}

/** Options for {@link recordMemory}. */
export interface RecordMemoryOptions {
  db: Kysely<DB>;
  worldId: string;
  npcId: string;
  memory: RecordMemoryInput;
  now: Date;
}

const DEFAULT_IMPORTANCE = 50;
const DEFAULT_DECAY_RATE = 0.01;
const DEFAULT_RECALL_LIMIT = 20;
const MAX_HISTORY_ENTRIES = 50;

/**
 * Persist one memory for an NPC and stamp its decay clock.
 * @param options
 * @returns the stored row, including its generated id.
 * @throws {Error} When `content` is blank — an empty memory can never be recalled.
 */
export async function recordMemory(options: RecordMemoryOptions,): Promise<NpcMemoryRow> {
  const { db, worldId, npcId, memory, now, } = options;
  if (memory.content.trim() === "") { throw new Error("recordMemory: content must not be blank",); }

  const at = now.toISOString();
  const row: NpcMemoryRow = {
    id: uid(),
    world_id: worldId,
    npc_id: npcId,
    memory_type: memory.memoryType ?? "episodic",
    content: memory.content,
    importance: memory.importance ?? DEFAULT_IMPORTANCE,
    emotional_impact: memory.emotionalImpact ?? 0,
    participants: jsonStringifyOr(memory.participants ?? [],),
    location_id: memory.locationId ?? null,
    decay_rate: memory.decayRate ?? DEFAULT_DECAY_RATE,
    shared: memory.shared === true ? 1 : 0,
    created_at: at,
    last_reinforced_at: at,
    expires_at: memory.expiresAt ?? null,
  };

  await db.insertInto("npc_memories",).values(row,).execute();
  getRpgLog("npc-memory",).debug("Recorded NPC memory", { npcId, worldId, memoryId: row.id, },);
  return row;
}

/** Options for {@link recallMemories}. */
export interface RecallMemoriesOptions {
  db: Kysely<DB>;
  worldId: string;
  npcId: string;
  limit?: number;
}

/**
 * List an NPC's still-fresh memories, most important first.
 *
 * Expired rows are filtered out; zero-importance rows fall off the bottom.
 * @param options
 * @returns rows ordered by `importance` desc, then `created_at` desc.
 */
export async function recallMemories(options: RecallMemoriesOptions,): Promise<NpcMemoryRow[]> {
  const { db, worldId, npcId, limit = DEFAULT_RECALL_LIMIT, } = options;
  return db
    .selectFrom("npc_memories",)
    .selectAll()
    .where("world_id", "=", worldId,)
    .where("npc_id", "=", npcId,)
    .where("importance", ">", 0,)
    .where((eb,) => eb.or([eb("expires_at", "is", null,), eb("expires_at", ">", new Date().toISOString(),),],))
    .orderBy("importance", "desc",)
    .orderBy("created_at", "desc",)
    .limit(limit,)
    .execute();
}

/**
 * Refresh a memory's decay clock and bump its importance by one point.
 *
 * Recalling or re-experiencing a memory is what makes it stick: the clock
 * restarts from `now`, so the next sweep measures elapsed time from here
 * rather than from the original formation.
 * @param db
 * @param memoryId
 * @param now
 * @returns the updated row.
 * @throws {Error} When no memory with `memoryId` exists.
 */
export async function reinforceMemory(
  db: Kysely<DB>,
  memoryId: string,
  now: Date,
): Promise<NpcMemoryRow> {
  const updated = await db
    .updateTable("npc_memories",)
    .set((eb,) => ({ last_reinforced_at: now.toISOString(), importance: eb("importance", "+", 1,), }))
    .where("id", "=", memoryId,)
    .returningAll()
    .executeTakeFirst();

  if (!updated) { throw new Error(`reinforceMemory: no memory with id ${memoryId}`,); }
  return updated;
}

/** Standing + bond inputs to {@link computeRelationshipType}. */
export interface RelationshipStanding {
  standing: number;
  bond: number;
}

/**
 * Derive the relationship band from standing + bond.
 *
 * Hostility is decided before warmth so a deep grudge cannot be masked by a
 * warm bond, and vice versa. Pure — no DB, no clock.
 * @param input
 * @returns the band for the given standing/bond pair.
 */
export function computeRelationshipType(input: RelationshipStanding,): NpcRelationshipType {
  const worse = Math.min(input.standing, input.bond,);
  const better = Math.max(input.standing, input.bond,);

  if (worse <= -75) { return "enemy"; }
  if (worse <= -25) { return "rival"; }
  if (better >= 75) { return "ally"; }
  if (better >= 40) { return "friend"; }
  if (better > 0) { return "acquaintance"; }
  return "stranger";
}

/** Options for {@link updateRelationship}. */
export interface UpdateRelationshipOptions {
  db: Kysely<DB>;
  worldId: string;
  npcId: string;
  targetId: string;
  /** Applied to standing and bond alike, then both are clamped to -100..100. */
  delta: number;
  now: Date;
}

/** Keep a standing/bond value inside the -100..100 band the column CHECK allows. */
function clamp(value: number,): number {
  return Math.max(-100, Math.min(100, value,),);
}

/**
 * Shift an NPC's attitude toward a target and re-derive its band.
 *
 * Upserts on (world, npc, target). `targetId` is deliberately unconstrained —
 * it may be an actor id, a monster template id, or a faction name.
 * @param options
 * @returns the stored row, with `history` left as its raw JSON string.
 */
export async function updateRelationship(options: UpdateRelationshipOptions,): Promise<NpcRelationshipRow> {
  const { db, worldId, npcId, targetId, delta, now, } = options;
  const at = now.toISOString();

  const existing = await db
    .selectFrom("npc_relationships",)
    .selectAll()
    .where("world_id", "=", worldId,)
    .where("npc_id", "=", npcId,)
    .where("target_id", "=", targetId,)
    .executeTakeFirst();

  const entry: RelationshipHistoryEntry = { at, delta, };
  const history = [...parseJsonField<RelationshipHistoryEntry[]>(existing?.history, [],), entry,].slice(
    -MAX_HISTORY_ENTRIES,
  );

  const historyJson = jsonStringifyOr(history,);

  if (!existing) {
    const seeded = clamp(delta,);
    const inserted: NpcRelationshipRow = {
      id: uid(),
      world_id: worldId,
      npc_id: npcId,
      target_id: targetId,
      standing: seeded,
      emotional_bond: seeded,
      relationship_type: computeRelationshipType({ standing: seeded, bond: seeded, },),
      history: historyJson,
      last_interaction_at: at,
    };

    await db.insertInto("npc_relationships",).values(inserted,).execute();
    return inserted;
  }

  const standing = clamp(existing.standing + delta,);
  const bond = clamp(existing.emotional_bond + delta,);
  const relationshipType = computeRelationshipType({ standing, bond, },);
  const patch = {
    standing,
    emotional_bond: bond,
    relationship_type: relationshipType,
    history: historyJson,
    last_interaction_at: at,
  };

  await db.updateTable("npc_relationships",).set(patch,).where("id", "=", existing.id,).execute();
  return { ...existing, ...patch, };
}
