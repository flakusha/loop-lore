// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage for `src/memory/embeddings.ts`.
 *
 * The embedding provider is exercised against a local fake Ollama server
 * (Bun.serve on an ephemeral port) selected via OLLAMA_BASE_URL — no module
 * mocking, no external services. Storage helpers run against a real
 * in-memory SQLite DB with the migrated schema.
 *
 * Covers: embedText (success + provider damage), rankBySimilarity (math,
 * topK, minScore, damage), storeEmbedding upsert, deleteEmbedding,
 * getStoredVectors (batch fetch, empty input, truncated blobs), and the full
 * semanticRecall pipeline.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  type SemanticMatch,
  deleteEmbedding,
  embedText,
  getStoredVectors,
  rankBySimilarity,
  semanticRecall,
  storeEmbedding,
} from "./embeddings";

// ── Fake Ollama server ──────────────────────────────────────────────────────

/** Embedding payload the fake server will serve next (null → 500 error). */
let nextEmbeddings: number[][] | { error: string } | null = null;

/** Last JSON body received by the fake /api/embed endpoint. */
let lastEmbedBody: { model?: string; input?: string[] } | undefined;

const server = Bun.serve({
  port: 0,
  fetch: async (req,) => {
    if (new URL(req.url,).pathname !== "/api/embed") {
      return new Response("not found", { status: 404, },);
    }
    lastEmbedBody = await req.json() as { model?: string; input?: string[] };
    if (nextEmbeddings === null) {
      return Response.json({ error: "embedding model not loaded", }, { status: 500, },);
    }
    if ("error" in nextEmbeddings) {
      return Response.json(nextEmbeddings, { status: 500, },);
    }
    return Response.json({ embeddings: nextEmbeddings, },);
  },
});

const ORIGINAL_BASE_URL = process.env.OLLAMA_BASE_URL;

beforeAll(() => {
  createLogger({ level: "error", },);
  process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${server.port}`;
},);

afterAll(() => {
  if (ORIGINAL_BASE_URL === undefined) {
    delete process.env.OLLAMA_BASE_URL;
  } else {
    process.env.OLLAMA_BASE_URL = ORIGINAL_BASE_URL;
  }
  void server.stop(true,);
},);

// ── embedText ───────────────────────────────────────────────────────────────

describe("embedText", () => {
  test("returns an L2-normalised vector from the provider", async () => {
    nextEmbeddings = [[3, 4], [0, 0],];
    const vec = await embedText("normalise me",);
    expect(vec,).toBeInstanceOf(Float32Array,);
    expect(vec.length,).toBe(2,);
    expect(vec[0],).toBeCloseTo(0.6, 5,);
    expect(vec[1],).toBeCloseTo(0.8, 5,);
    // Only the first embedding row is used; the request posts model + input.
    expect(lastEmbedBody?.model,).toBe("nomic-embed-text",);
    expect(lastEmbedBody?.input,).toEqual(["normalise me",],);
  },);

  test("zero vector passes through unnormalised (norm 0 guard)", async () => {
    nextEmbeddings = [[0, 0, 0],];
    const vec = await embedText("zero",);
    expect(Array.from(vec,),).toEqual([0, 0, 0],);
  },);

  test("throws when the provider returns no embeddings", async () => {
    nextEmbeddings = [];
    expect(embedText("empty",),).rejects.toThrow("Embedding provider returned no embeddings.",);
  },);

  test("propagates provider errors (HTTP 500)", async () => {
    nextEmbeddings = { error: "model exploded", };
    expect(embedText("boom",),).rejects.toThrow("model exploded",);
  },);
},);

// ── rankBySimilarity ────────────────────────────────────────────────────────

describe("rankBySimilarity", () => {
  const unitA = new Float32Array([0.6, 0.8],);
  const unitB = new Float32Array([0.8, -0.6],);
  const unitC = new Float32Array([1, 0],);

  test("scores candidates by dot product and sorts descending", () => {
    const matches = rankBySimilarity([
      { memoryId: "b", vector: unitB, },
      { memoryId: "a", vector: unitA, },
      { memoryId: "c", vector: unitC, },
    ], unitA, 10, 0,);
    expect(matches.map((m: SemanticMatch) => m.memoryId,),).toEqual(["a", "c", "b",],);
    expect(matches[0]?.score,).toBeCloseTo(1, 5,);
    expect(matches[1]?.score,).toBeCloseTo(0.6, 5,);
    expect(matches[2]?.score,).toBeCloseTo(0, 5,);
  },);

  test("filters below minScore", () => {
    const matches = rankBySimilarity([
      { memoryId: "a", vector: unitA, },
      { memoryId: "b", vector: unitB, },
    ], unitA, 10, 0.5,);
    expect(matches.map((m,) => m.memoryId,),).toEqual(["a",],);
  },);

  test("topK caps the result list", () => {
    const candidates = ["a", "b", "c",].map((id,) => ({ memoryId: id, vector: unitA, }),);
    const matches = rankBySimilarity(candidates, unitA, 2, 0,);
    expect(matches,).toHaveLength(2,);
  },);

  test("empty candidate list returns empty matches", () => {
    expect(rankBySimilarity([], unitA, 10, 0,),).toEqual([],);
  },);

  test("damaged candidate vectors (dimension mismatch) do not crash — score degrades via ?? 0", () => {
    const truncated = new Float32Array([0.6,],);
    const matches = rankBySimilarity([
      { memoryId: "short", vector: truncated, },
      { memoryId: "full", vector: unitA, },
    ], unitA, 10, 0,);
    expect(matches,).toHaveLength(2,);
    expect(matches[0]?.memoryId,).toBe("full",);
  },);
},);

// ── Storage round-trip ──────────────────────────────────────────────────────

describe("embedding storage", () => {
  let db: Kysely<DB>;
  let sqlite: { close(): void };

  beforeEach(async () => {
    createLogger({ level: "error", },);
    const ctx = await createTestDb();
    db = ctx.db;
    sqlite = ctx.sqlite;
  },);

  afterEach(() => {
    sqlite.close();
  },);

  test("stores, reads back, and deletes a vector", async () => {
    const vector = new Float32Array([0.5, -0.25, 2,],);
    await storeEmbedding(db, "mem-emb-1", vector, "test-model",);

    const vectors = await getStoredVectors(db, ["mem-emb-1", "missing",],);
    expect(vectors.size,).toBe(1,);
    const restored = vectors.get("mem-emb-1",);
    expect(restored,).toBeInstanceOf(Float32Array,);
    expect(restored?.length,).toBe(3,);
    expect(restored?.[0],).toBeCloseTo(0.5, 5,);
    expect(restored?.[1],).toBeCloseTo(-0.25, 5,);
    expect(restored?.[2],).toBeCloseTo(2, 5,);

    await deleteEmbedding(db, "mem-emb-1",);
    const remaining = await getStoredVectors(db, ["mem-emb-1",],);
    expect(remaining.size,).toBe(0,);
  },);

  test("upserts on the same memory_id instead of duplicating", async () => {
    await storeEmbedding(db, "mem-emb-2", new Float32Array([1, 2, 3, 4],), "model-a",);
    await storeEmbedding(db, "mem-emb-2", new Float32Array([9, 9],), "model-b",);

    const rows = await db
      .selectFrom("memory_embeddings",)
      .select(["model", "dimensions",],)
      .where("memory_id", "=", "mem-emb-2",)
      .execute();
    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.model,).toBe("model-b",);
    expect(rows[0]?.dimensions,).toBe(2,);

    const vectors = await getStoredVectors(db, ["mem-emb-2",],);
    expect(vectors.get("mem-emb-2",)?.length,).toBe(2,);
    expect(vectors.get("mem-emb-2",)?.[0],).toBeCloseTo(9, 5,);
  },);

  test("uses the default model name when omitted", async () => {
    await storeEmbedding(db, "mem-emb-3", new Float32Array([1,],),);
    const row = await db
      .selectFrom("memory_embeddings",)
      .select("model",)
      .where("memory_id", "=", "mem-emb-3",)
      .executeTakeFirst();
    expect(row?.model,).toBe("nomic-embed-text",);
  },);

  test("returns an empty map for an empty id list without querying", async () => {
    const vectors = await getStoredVectors(db, [],);
    expect(vectors.size,).toBe(0,);
  },);

  test("decodes a truncated blob (byte length not a multiple of 4) by flooring dims", async () => {
    // 6 raw bytes → floor(6 / 4) = 1 float32 (second float is incomplete).
    await db
      .insertInto("memory_embeddings",)
      .values({
        memory_id: "mem-truncated",
        model: "test-model",
        dimensions: 2,
        vector_blob: Buffer.from([0, 0, 128, 63, 255, 255],),
        created_at: Math.floor(Date.now() / 1000,),
      },)
      .execute();

    const vectors = await getStoredVectors(db, ["mem-truncated",],);
    const vec = vectors.get("mem-truncated",);
    expect(vec?.length,).toBe(1,);
    expect(vec?.[0],).toBeCloseTo(1, 5,); // 0x3f800000 little-endian = 1.0
  },);

  test("decodes an empty blob into a zero-length vector", async () => {
    await db
      .insertInto("memory_embeddings",)
      .values({
        memory_id: "mem-empty-blob",
        model: "test-model",
        dimensions: 0,
        vector_blob: Buffer.alloc(0,),
        created_at: Math.floor(Date.now() / 1000,),
      },)
      .execute();

    const vectors = await getStoredVectors(db, ["mem-empty-blob",],);
    expect(vectors.get("mem-empty-blob",)?.length,).toBe(0,);
  },);
},);

// ── semanticRecall pipeline ─────────────────────────────────────────────────

describe("semanticRecall", () => {
  let db: Kysely<DB>;
  let sqlite: { close(): void };

  beforeAll(async () => {
    createLogger({ level: "error", },);
    const ctx = await createTestDb();
    db = ctx.db;
    sqlite = ctx.sqlite;
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("returns empty matches for an empty candidate list without embedding the query", async () => {
    nextEmbeddings = [[1, 0],];
    lastEmbedBody = undefined;
    const matches = await semanticRecall(db, [], "unused query",);
    expect(matches,).toEqual([],);
    expect(lastEmbedBody,).toBeUndefined();
  },);

  test("ranks stored vectors against the embedded query and applies minScore + topK", async () => {
    // Query embeds to [0.6, 0.8]; candidates: perfect match, partial, orthogonal.
    nextEmbeddings = [[0.6, 0.8],];
    await storeEmbedding(db, "recall-a", new Float32Array([0.6, 0.8],), "m",);
    await storeEmbedding(db, "recall-b", new Float32Array([1, 0],), "m",);
    await storeEmbedding(db, "recall-c", new Float32Array([0.8, -0.6],), "m",);

    const matches = await semanticRecall(db, ["recall-a", "recall-b", "recall-c",], "find similar", 10, 0.3,);

    expect(matches.map((m,) => m.memoryId,),).toEqual(["recall-a", "recall-b",],);
    expect(matches[0]?.score,).toBeCloseTo(1, 4,);
    expect(matches[1]?.score,).toBeCloseTo(0.6, 4,);
  },);

  test("topK truncates the ranked list", async () => {
    nextEmbeddings = [[0.6, 0.8],];
    const matches = await semanticRecall(db, ["recall-a", "recall-b",], "top k", 1, 0,);
    expect(matches,).toHaveLength(1,);
    expect(matches[0]?.memoryId,).toBe("recall-a",);
  },);
},);
