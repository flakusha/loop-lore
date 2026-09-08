// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory tier providers — FTS5 `keyword` and cosine `vector`.
 *
 * `keyword` reads `memories_fts` (`parts/016_fts.ts`); `vector` reuses the
 * semantic pipeline from `memory/embeddings.ts` (`getStoredVectors` +
 * `rankBySimilarity`, or the full `semanticRecall` with the default
 * embedder). Both tiers scope to one actor.
 */
import { type Kysely, sql, } from "kysely";
import type { DB, } from "../../db";
import { getStoredVectors, rankBySimilarity, semanticRecall, } from "../../memory/embeddings";
import { bm25ToScore, } from "../rank";
import type { SearchHit, TierProvider, } from "../types";

/** Payload carried on memory hits. */
export interface MemoryHit {
  /** actor_memories.id. */
  memoryId: string;
  /** Owning actor. */
  actorId: string;
  /** Memory content (for context injection). */
  content: string;
  /** fact, summary, … */
  memoryType: string;
}

/** Options for {@link createMemoryProviders}. */
export interface MemoryProviderOptions {
  /**
   * Embed the query text (test seam / custom model). Defaults to the
   * Ollama embedder used by `semanticRecall`.
   */
  embedQuery?: (text: string,) => Promise<Float32Array>;
}

interface MemoryRow {
  id: string;
  actor_id: string;
  content: string;
  memory_type: string;
}

function toHit(row: MemoryRow, score: number, source: SearchHit["source"],): SearchHit<MemoryHit> {
  return {
    id: row.id,
    score,
    source,
    payload: {
      memoryId: row.id,
      actorId: row.actor_id,
      content: row.content,
      memoryType: row.memory_type,
    },
  };
}

async function rankWithCustomEmbed(
  db: Kysely<DB>,
  candidateIds: string[],
  queryText: string,
  embedQuery: (text: string,) => Promise<Float32Array>,
  topK: number,
  minScore: number,
): Promise<SearchHit<MemoryHit>[]> {
  const vectorMap = await getStoredVectors(db, candidateIds,);
  const queryVec = await embedQuery(queryText,);
  const candidates = Array.from(vectorMap.entries(),).map(([memoryId, vector,],) => ({
    memoryId,
    vector,
  }));
  const matches = rankBySimilarity(candidates, queryVec, topK, minScore,);
  if (matches.length === 0) { return []; }
  const rows = await db
    .selectFrom("actor_memories",)
    .select(["id", "actor_id", "content", "memory_type",],)
    .where(
      "id",
      "in",
      matches.map((match,) => match.memoryId),
    )
    .execute();
  const byId = new Map(rows.map((row,) => [row.id, row,]),);
  const hits: SearchHit<MemoryHit>[] = [];
  for (const match of matches) {
    const row = byId.get(match.memoryId,);
    if (row !== undefined) { hits.push(toHit(row, match.score, "vector",),); }
  }
  return hits;
}

/**
 * Create DB-backed memory tier providers scoped to one actor.
 * @param db - typed Kysely instance
 * @param opts - optional query embedder override
 * @returns keyword/vector providers for the service
 */
export function createMemoryProviders(
  db: Kysely<DB>,
  opts?: MemoryProviderOptions,
): { keyword: TierProvider<MemoryHit>; vector: TierProvider<MemoryHit> } {
  const keyword: TierProvider<MemoryHit> = async (query, scope,) => {
    if (scope.kind !== "memories") { return []; }
    const parts = query.q.toLowerCase().split(/[^a-z0-9]+/,).filter((t,) => t.length > 0);
    if (parts.length === 0) { return []; }
    const ftsQuery = parts.map((t,) => `"${t.replaceAll('"', '""',)}"`).join(" ",);
    const topK = query.topK ?? 20;
    const rows = await sql<MemoryRow & { rank: number }>`
      SELECT m.id, m.actor_id, m.content, m.memory_type, bm25(memories_fts) AS rank
      FROM memories_fts
      JOIN actor_memories m ON m.id = memories_fts.memory_id
      WHERE memories_fts MATCH ${ftsQuery} AND m.actor_id = ${scope.actorId}
      ORDER BY rank ASC LIMIT ${topK}
    `.execute(db,);
    return rows.rows.map((row,) => toHit(row, bm25ToScore(-row.rank,), "fts",));
  };

  const vector: TierProvider<MemoryHit> = async (query, scope,) => {
    if (scope.kind !== "memories") { return []; }
    const topK = query.topK ?? 20;
    const minScore = query.minScore ?? 0.3;
    const candidates = await db
      .selectFrom("actor_memories",)
      .select("id",)
      .where("actor_id", "=", scope.actorId,)
      .execute();
    const candidateIds = candidates.map((c,) => c.id);
    if (candidateIds.length === 0) { return []; }
    if (opts?.embedQuery !== undefined) {
      return rankWithCustomEmbed(db, candidateIds, query.q, opts.embedQuery, topK, minScore,);
    }
    const matches = await semanticRecall(db, candidateIds, query.q, topK, minScore,);
    if (matches.length === 0) { return []; }
    const rows = await db
      .selectFrom("actor_memories",)
      .select(["id", "actor_id", "content", "memory_type",],)
      .where(
        "id",
        "in",
        matches.map((match,) => match.memoryId),
      )
      .execute();
    const byId = new Map(rows.map((row,) => [row.id, row,]),);
    const hits: SearchHit<MemoryHit>[] = [];
    for (const match of matches) {
      const row = byId.get(match.memoryId,);
      if (row !== undefined) { hits.push(toHit(row, match.score, "vector",),); }
    }
    return hits;
  };

  return { keyword, vector, };
}
