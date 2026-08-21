// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory Embeddings — embed, store, and semantic-recall for actor memories.
 *
 * Design:
 *   embedText(text)     — call the configured embedding provider (Ollama by
 *                         default via embedDispatch); returns a normalised
 *                         Float32Array (unit L2).
 *   storeEmbedding()    — upsert a vector blob + metadata to memory_embeddings.
 *   deleteEmbedding()  — remove vector on memory deletion.
 *   semanticRecall()    — cosine-similarity top-K over candidates; result ids
 *                         are merged with keyword-ranked list in provisionMemories.
 *
 * Cosine similarity: dot(a,b) / (|a|*|b|).  Vectors are unit-normalised at
 * embed time, so similarity = dot product (single pass, no divide).
 */
import type { Kysely } from "kysely";
import type { DB } from "../db";
import type { OllamaNativeState } from "../generation/providers/ollama-native/types";
import { embedDispatch } from "../generation/providers/ollama-native/operations";

// ── Types ──────────────────────────────────────────────────────────────────

export interface EmbeddedMemory {
  memoryId: string;
  content: string;
  vector: Float32Array;
}

export interface SemanticMatch {
  memoryId: string;
  score: number;
}

// ── Ollama state ─────────────────────────────────────────────────────────────

/**
 * Build the Ollama native state from environment / defaults.
 *
 * Matches the pattern used in tests and avoids a hard dependency on the
 * provider registry at import time.  Override via OLLAMA_BASE_URL env var.
 */
function buildOllamaState(): OllamaNativeState {
  return {
    baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    apiKey: undefined,
    defaultModel: "nomic-embed-text",
    timeout: 30_000,
    retries: 1,
    headers: {},
  };
}

// ── Math helpers ─────────────────────────────────────────────────────────────

/** L2 norm of a vector. */
function l2Norm(vec: Float32Array): number {
  let s = 0;
  for (let i = 0; i < vec.length; i++) { s += (vec[i] ?? 0) * (vec[i] ?? 0); }
  return Math.sqrt(s);
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) { s += (a[i] ?? 0) * (b[i] ?? 0); }
  return s;
}

function normalise(vec: Float32Array): Float32Array {
  const norm = l2Norm(vec);
  if (norm === 0) { return vec; }
  for (let i = 0; i < vec.length; i++) { vec[i] = (vec[i] ?? 0) / norm; }
  return vec;
}
// ── Embedding ─────────────────────────────────────────────────────────────

/**
 * Embed a single text string via the configured Ollama embedding model.
 *
 * @throws If the embedding call fails or returns no results.
 */
export async function embedText(text: string): Promise<Float32Array> {
  const state = buildOllamaState();
  const embeddings = await embedDispatch(state, text, "nomic-embed-text");
  const emb = embeddings[0];
  if (!emb) { throw new Error("Embedding provider returned no embeddings."); }
  // Normalise to unit length so cosine similarity = dot product.
  return normalise(new Float32Array(emb));
}

// ── Storage ────────────────────────────────────────────────────────────────

/**
 * Upsert a vector for a memory row.
 *
 * @param memoryId  Primary key of actor_memories
 * @param vector    Normalised float32 vector (any dimension)
 * @param model     Embedding model name
 */
export async function storeEmbedding(
  db: Kysely<DB>,
  memoryId: string,
  vector: Float32Array,
  model = "nomic-embed-text",
): Promise<void> {
  const dims = vector.length;
  const uint8 = new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength);
  await db
    .insertInto("memory_embeddings")
    .values({
      memory_id: memoryId,
      model,
      dimensions: dims,
      vector_blob: Buffer.from(uint8),
      created_at: Math.floor(Date.now() / 1000),
    })
    .onConflict((oc) =>
      oc.column("memory_id").doUpdateSet({
        model,
        dimensions: dims,
        vector_blob: Buffer.from(uint8),
        created_at: Math.floor(Date.now() / 1000),
      })
    )
    .execute();
}

/**
 * Delete the vector row for a memory.
 */
export async function deleteEmbedding(
  db: Kysely<DB>,
  memoryId: string,
): Promise<void> {
  await db
    .deleteFrom("memory_embeddings")
    .where("memory_id", "=", memoryId)
    .execute();
}

// ── Semantic Recall ───────────────────────────────────────────────────────

/**
 * Rank candidate memories by cosine similarity to a query vector (exact scan).
 *
 * For bounded candidate sets (≤50 from fetchActorMemories) this is fast enough.
 * If candidate sets grow, replace with an approximate method (HNSW / IVF).
 *
 * @param candidates  Memory ids with their pre-loaded vectors
 * @param queryVec   Unit-normalised query embedding
 * @param topK      Max results to return
 * @param minScore  Minimum cosine similarity [0..1]; default 0.5
 */
export function rankBySimilarity(
  candidates: { memoryId: string; vector: Float32Array }[],
  queryVec: Float32Array,
  topK = 10,
  minScore = 0.5,
): SemanticMatch[] {
  return candidates
    .map(({ memoryId, vector }) => ({ memoryId, score: dot(queryVec, vector) }))
    .filter((m) => m.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Load stored vectors for a list of memory ids (batch fetch).
 */
export async function getStoredVectors(
  db: Kysely<DB>,
  memoryIds: string[],
): Promise<Map<string, Float32Array>> {
  if (memoryIds.length === 0) { return new Map(); }
  const rows = await db
    .selectFrom("memory_embeddings")
    .select(["memory_id", "vector_blob"])
    .where("memory_id", "in", memoryIds)
    .execute();

  const map = new Map<string, Float32Array>();
  for (const row of rows) {
    const buf = Buffer.from(row.vector_blob);
    const dims = Math.floor(buf.byteLength / 4);
    map.set(row.memory_id, new Float32Array(buf.buffer, buf.byteOffset, dims));
  }
  return map;
}

/**
 * Full semantic recall pipeline:
 *   1. embed the query text
 *   2. batch-load vectors for candidate ids
 *   3. rank by cosine similarity
 *
 * Returns ids with scores ≥ minScore, sorted descending.
 */
export async function semanticRecall(
  db: Kysely<DB>,
  candidateIds: string[],
  queryText: string,
  topK = 10,
  minScore = 0.5,
): Promise<SemanticMatch[]> {
  if (candidateIds.length === 0) { return []; }
  const [queryVec, vectorMap] = await Promise.all([
    embedText(queryText),
    getStoredVectors(db, candidateIds),
  ]);
  const candidates = Array.from(vectorMap.entries()).map(([memoryId, vector]) => ({
    memoryId,
    vector,
  }));
  return rankBySimilarity(candidates, queryVec, topK, minScore);
}
