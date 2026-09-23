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
 *                         Optional cross-encoder rerank stage (RERANK_MODEL).
 *
 * Transport: EMBEDDINGS_API selects "ollama" (default, /api/embed) or "openai"
 * (/v1/embeddings — llama.cpp / llama-swap).  OLLAMA_EMBED_MODEL overrides the
 * embedding model; EMBEDDINGS_BASE_URL overrides the endpoint base.
 *
 * Cosine similarity: dot(a,b) / (|a|*|b|).  Vectors are unit-normalised at
 * embed time, so similarity = dot product (single pass, no divide).
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db";
import { embedDispatch, } from "../generation/providers/ollama-native/operations";
import type { OllamaNativeState, } from "../generation/providers/ollama-native/types";
import { getLogger, } from "../logger";
import { rerankViaLlamaCpp, } from "./rerank";
import { safeFromUint8Array, } from "../utils/safe-buffer";

// ── Types ──────────────────────────────────────────────────────────────────

/** */
export interface EmbeddedMemory {
  memoryId: string;
  content: string;
  vector: Float32Array;
}

/** */
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
    defaultModel: resolveEmbedModel(),
    timeout: 30_000,
    retries: 1,
    headers: {},
  };
}

// ── Math helpers ─────────────────────────────────────────────────────────────

// ── Env configuration ───────────────────────────────────────────────────────

/**
 * Single source of truth for the embedding model.
 * OLLAMA_EMBED_MODEL overrides; default "nomic-embed-text".
 */
function resolveEmbedModel(): string {
  return process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text";
}

/**
 * Embeddings base URL: EMBEDDINGS_BASE_URL → OLLAMA_BASE_URL → localhost.
 */
function resolveEmbeddingsBaseUrl(): string {
  return process.env.EMBEDDINGS_BASE_URL ?? process.env.OLLAMA_BASE_URL
    ?? "http://localhost:11434";
}

/**
 * Embed via an OpenAI-compatible POST /v1/embeddings endpoint (llama.cpp
 * server / llama-swap expose no Ollama /api/embed route).
 * @param text
 * @param model
 * @param baseUrl
 * @throws On transport failure, non-OK status, or an empty response.
 */
async function embedViaOpenAI(text: string, model: string, baseUrl: string,): Promise<number[]> {
  const response = await fetch(`${baseUrl}/v1/embeddings`, {
    method: "POST",
    headers: { "content-type": "application/json", },
    body: JSON.stringify({ model, input: text, },),
    signal: AbortSignal.timeout(30_000,),
  },);
  if (!response.ok) {
    throw new Error(`OpenAI embeddings endpoint returned HTTP ${response.status}.`,);
  }
  const payload = await response.json() as { data?: { embedding?: number[] }[] };
  const emb = payload.data?.[0]?.embedding;
  if (!emb) { throw new Error("Embedding provider returned no embeddings.",); }
  return emb;
}

/**
 * L2 norm of a vector.
 * @param vec
 */
function l2Norm(vec: Float32Array,): number {
  let s = 0;
  for (let i = 0; i < vec.length; i++) { s += (vec[i] ?? 0) * (vec[i] ?? 0); }
  return Math.sqrt(s,);
}

/**
 * @param a
 * @param b
 */
function dot(a: Float32Array, b: Float32Array,): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) { s += (a[i] ?? 0) * (b[i] ?? 0); }
  return s;
}

/**
 * @param vec
 */
function normalise(vec: Float32Array,): Float32Array {
  const norm = l2Norm(vec,);
  if (norm === 0) { return vec; }
  for (let i = 0; i < vec.length; i++) { vec[i] = (vec[i] ?? 0) / norm; }
  return vec;
}
// ── Embedding ─────────────────────────────────────────────────────────────

/**
 * Embed a single text string via the configured embedding transport
 * (EMBEDDINGS_API: "ollama" default | "openai" for llama.cpp / llama-swap).
 * @param text
 * @throws If the embedding call fails or returns no results.
 */
export async function embedText(text: string,): Promise<Float32Array> {
  const model = resolveEmbedModel();
  let emb: number[] | undefined;
  if (process.env.EMBEDDINGS_API === "openai") {
    emb = await embedViaOpenAI(text, model, resolveEmbeddingsBaseUrl(),);
  } else {
    emb = (await embedDispatch(buildOllamaState(), text, model,))[0];
  }
  if (!emb) { throw new Error("Embedding provider returned no embeddings.",); }
  // Normalise to unit length so cosine similarity = dot product.
  return normalise(new Float32Array(emb,),);
}

// ── Storage ────────────────────────────────────────────────────────────────

/**
 * Upsert a vector for a memory row.
 * @param db
 * @param memoryId  Primary key of actor_memories
 * @param vector    Normalised float32 vector (any dimension)
 * @param model     Embedding model name
 */
export async function storeEmbedding(
  db: Kysely<DB>,
  memoryId: string,
  vector: Float32Array,
  model = resolveEmbedModel(),
): Promise<void> {
  const dims = vector.length;
  const uint8 = new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength,);
  const sized = safeFromUint8Array(uint8,);
  if (!sized.ok) { throw sized.error; }
  const vectorBuf = sized.buffer;
  await db
    .insertInto("memory_embeddings",)
    .values({
      memory_id: memoryId,
      model,
      dimensions: dims,
      vector_blob: vectorBuf,
      created_at: Math.floor(Date.now() / 1000,),
    },)
    .onConflict((oc,) =>
      oc.column("memory_id",).doUpdateSet({
        model,
        dimensions: dims,
        vector_blob: vectorBuf,
        created_at: Math.floor(Date.now() / 1000,),
      },)
    )
    .execute();
}

/**
 * Delete the vector row for a memory.
 * @param db
 * @param memoryId
 */
export async function deleteEmbedding(
  db: Kysely<DB>,
  memoryId: string,
): Promise<void> {
  await db
    .deleteFrom("memory_embeddings",)
    .where("memory_id", "=", memoryId,)
    .execute();
}

// ── Semantic Recall ───────────────────────────────────────────────────────

/**
 * Rank candidate memories by cosine similarity to a query vector (exact scan).
 *
 * For bounded candidate sets (≤50 from fetchActorMemories) this is fast enough.
 * If candidate sets grow, replace with an approximate method (HNSW / IVF).
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
    .map(({ memoryId, vector, },) => ({ memoryId, score: dot(queryVec, vector,), }))
    .filter((m,) => m.score >= minScore)
    .sort((a, b,) => b.score - a.score)
    .slice(0, topK,);
}

/**
 * Load stored vectors for a list of memory ids (batch fetch).
 * @param db
 * @param memoryIds
 */
export async function getStoredVectors(
  db: Kysely<DB>,
  memoryIds: string[],
): Promise<Map<string, Float32Array>> {
  if (memoryIds.length === 0) { return new Map(); }
  const rows = await db
    .selectFrom("memory_embeddings",)
    .select(["memory_id", "vector_blob",],)
    .where("memory_id", "in", memoryIds,)
    .execute();
  const map = new Map<string, Float32Array>();
  for (const row of rows) {
    const sized = safeFromUint8Array(new Uint8Array(row.vector_blob,),);
    if (!sized.ok) { throw sized.error; }
    const buf = sized.buffer;

    const dims = Math.floor(buf.byteLength / 4,);
    map.set(row.memory_id, new Float32Array(buf.buffer, buf.byteOffset, dims,),);
  }
  return map;
}

/**
 * Fetch actor_memories content for the given ids, preserving order.
 * @param db
 * @param ids
 * @throws If any id has no row (rerank callers fail open).
 */
async function fetchMemoryTexts(db: Kysely<DB>, ids: string[],): Promise<string[]> {
  const rows = await db
    .selectFrom("actor_memories",)
    .select(["id", "content",],)
    .where("id", "in", ids,)
    .execute();
  const byId = new Map<string, string>();
  for (const row of rows) { byId.set(row.id, row.content,); }
  return ids.map((id,) => {
    const content = byId.get(id,);
    if (content === undefined) { throw new Error(`actor_memories has no row for ${id}.`,); }
    return content;
  },);
}

/**
 * Full semantic recall pipeline:
 *   1. embed the query text
 *   2. batch-load vectors for candidate ids
 *   3. rank by cosine similarity (minScore gates this stage)
 *   4. optional cross-encoder rerank of the shortlist (RERANK_MODEL)
 *
 * Returns ids sorted by relevance — cosine scores, or reranker relevance
 * scores when the rerank stage runs (the two are not comparable).
 * @param db
 * @param candidateIds
 * @param queryText
 * @param topK
 * @param minScore
 */
export async function semanticRecall(
  db: Kysely<DB>,
  candidateIds: string[],
  queryText: string,
  topK = 10,
  minScore = 0.3,
): Promise<SemanticMatch[]> {
  if (candidateIds.length === 0) { return []; }
  /* eslint-disable no-restricted-syntax */
  const [queryVec, vectorMap,] = await Promise.all([
    embedText(queryText,),
    getStoredVectors(db, candidateIds,),
  ],);
  /* eslint-enable no-restricted-syntax */

  const candidates = Array.from(vectorMap.entries(),).map(([memoryId, vector,],) => ({
    memoryId,
    vector,
  }));

  const ranked = rankBySimilarity(candidates, queryVec, topK, minScore,);

  const rerankModel = process.env.RERANK_MODEL;
  if (!rerankModel || ranked.length === 0) { return ranked; }

  // Rerank stage: shortlist the top cosine matches, rerank via llama.cpp,
  // slice to topK.  Rerank scores are not comparable to cosine scores, so
  // minScore gates the cosine stage only.  Any failure fails open.
  const shortlist = ranked.slice(0, Math.max(topK * 4, topK,),);
  try {
    const documents = await fetchMemoryTexts(db, shortlist.map((m,) => m.memoryId,),);
    const hits = await rerankViaLlamaCpp(queryText, documents, { model: rerankModel, topN: topK, },);
    const reordered: SemanticMatch[] = [];
    for (const { index, score, } of hits) {
      const match = shortlist[index];
      if (!match) { throw new Error(`Rerank index ${index} outside the shortlist.`,); }
      reordered.push({ memoryId: match.memoryId, score, },);
    }
    return reordered.slice(0, topK,);
  } catch (error) {
    getLogger()
      .child({ module: "memory-embeddings", },)
      .debug("Rerank failed; keeping cosine order", {
        error: error instanceof Error ? error.message : String(error,),
      },);
    return ranked;
  }
}
