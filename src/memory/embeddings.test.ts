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
 * Covers: embedText (ollama default, openai transport via EMBEDDINGS_API,
 * OLLAMA_EMBED_MODEL override, provider damage), rankBySimilarity (math, topK,
 * minScore, damage), storeEmbedding upsert, deleteEmbedding, getStoredVectors
 * (batch fetch, empty input, truncated blobs), and the full semanticRecall
 * pipeline incl. the optional rerank stage (reorder, fail-open, disabled).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, } from "../test-utils/insert-helpers";
import {
  deleteEmbedding,
  embedText,
  getStoredVectors,
  rankBySimilarity,
  type SemanticMatch,
  semanticRecall,
  storeEmbedding,
} from "./embeddings";

// ── Fake Ollama server ──────────────────────────────────────────────────────

/** Embedding payload the fake server will serve next (null → 500 error). */
let nextEmbeddings: number[][] | { error: string } | null = null;

/** Last JSON body received by the fake /api/embed endpoint. */
let lastEmbedBody: { model?: string; input?: string[] } | undefined;

/** OpenAI-transport payload served next at /v1/embeddings (null → 500 error). */
let nextOpenAIEmbedding: number[] | null = null;

/** Last JSON body received by the fake /v1/embeddings endpoint. */
let lastOpenAIBody: { model?: string; input?: string } | undefined;

/** Rerank response served next at /rerank (null → 500 error). */
let nextRerank: { results: { index: number; relevance_score: number }[] } | null = null;

/** Clear both captured-request bodies (helper keeps tsgo from narrowing the vars). */
function resetEmbedBodies(): void {
  lastEmbedBody = undefined;
  lastOpenAIBody = undefined;
}

/** Last JSON body received by the fake /rerank endpoint. */
let lastRerankBody: {
  model?: string;
  query?: string;
  documents?: string[];
  top_n?: number;
} | undefined;

/** How many requests reached the fake /rerank endpoint. */
let rerankHits = 0;

const server = Bun.serve({
  port: 0,
  fetch: async (req,) => {
    const pathname = new URL(req.url,).pathname;
    if (pathname === "/api/embed") {
      lastEmbedBody = await req.json() as { model?: string; input?: string[] };
      if (nextEmbeddings === null) {
        return Response.json({ error: "embedding model not loaded", }, { status: 500, },);
      }
      if ("error" in nextEmbeddings) {
        return Response.json(nextEmbeddings, { status: 500, },);
      }
      return Response.json({ embeddings: nextEmbeddings, },);
    }
    if (pathname === "/v1/embeddings") {
      lastOpenAIBody = await req.json() as { model?: string; input?: string };
      if (nextOpenAIEmbedding === null) {
        return Response.json({ error: "no model loaded", }, { status: 500, },);
      }
      return Response.json({ data: [{ embedding: nextOpenAIEmbedding, },], },);
    }
    if (pathname === "/rerank") {
      rerankHits += 1;
      lastRerankBody = await req.json() as typeof lastRerankBody;
      if (nextRerank === null) {
        return Response.json({ error: "reranker not loaded", }, { status: 500, },);
      }
      return Response.json(nextRerank,);
    }
    return new Response("not found", { status: 404, },);
  },
},);

const ORIGINAL_BASE_URL = process.env.OLLAMA_BASE_URL;

/** Env knobs mutated by these tests, captured before any test runs. */
const ORIGINAL_ENV: Record<string, string | undefined> = {
  EMBEDDINGS_API: process.env.EMBEDDINGS_API,
  EMBEDDINGS_BASE_URL: process.env.EMBEDDINGS_BASE_URL,
  OLLAMA_EMBED_MODEL: process.env.OLLAMA_EMBED_MODEL,
  RERANK_BASE_URL: process.env.RERANK_BASE_URL,
  RERANK_MODEL: process.env.RERANK_MODEL,
};

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

afterEach(() => {
  for (const [key, value,] of Object.entries(ORIGINAL_ENV,)) {
    if (value === undefined) { delete process.env[key]; }
    else { process.env[key] = value; }
  }
},);

// ── embedText ───────────────────────────────────────────────────────────────

describe("embedText", () => {
  test("returns an L2-normalised vector from the provider", async () => {
    nextEmbeddings = [[3, 4,], [0, 0,],];
    const vec = await embedText("normalise me",);
    expect(vec,).toBeInstanceOf(Float32Array,);
    expect(vec.length,).toBe(2,);
    expect(vec[0],).toBeCloseTo(0.6, 5,);
    expect(vec[1],).toBeCloseTo(0.8, 5,);
    // Only the first embedding row is used; the request posts model + input.
    expect(lastEmbedBody?.model,).toBe("nomic-embed-text",);
    expect(lastEmbedBody?.input,).toEqual(["normalise me",],);
  });

  test("zero vector passes through unnormalised (norm 0 guard)", async () => {
    nextEmbeddings = [[0, 0, 0,],];
    const vec = await embedText("zero",);
    expect(Array.from(vec,),).toEqual([0, 0, 0,],);
  });

  test("throws when the provider returns no embeddings", async () => {
    nextEmbeddings = [];
    expect(embedText("empty",),).rejects.toThrow("Embedding provider returned no embeddings.",);
  });

  test("propagates provider errors (HTTP 500)", async () => {
    nextEmbeddings = { error: "model exploded", };
    expect(embedText("boom",),).rejects.toThrow("model exploded",);
  });

  test("openai transport posts to /v1/embeddings with the OLLAMA_EMBED_MODEL value", async () => {
    process.env.EMBEDDINGS_API = "openai";
    process.env.OLLAMA_EMBED_MODEL = "text-embedder-under-test";
    nextOpenAIEmbedding = [3, 4,];
    resetEmbedBodies();
    resetEmbedBodies();

    const vec = await embedText("openai me",);

    // Normalised exactly like the Ollama path.
    expect(vec[0],).toBeCloseTo(0.6, 5,);
    expect(vec[1],).toBeCloseTo(0.8, 5,);
    expect(lastOpenAIBody?.model,).toBe("text-embedder-under-test",);
    expect(lastOpenAIBody?.input,).toBe("openai me",);
    expect(lastEmbedBody,).toBeUndefined(); // ollama route not touched
  });

  test("default transport stays on the ollama /api/embed route", async () => {
    delete process.env.EMBEDDINGS_API;
    nextEmbeddings = [[3, 4,],];
    resetEmbedBodies();
    resetEmbedBodies();

    await embedText("ollama me",);

    expect(lastEmbedBody,).toBeDefined();
    expect(lastOpenAIBody,).toBeUndefined();
  });

  test("OLLAMA_EMBED_MODEL overrides the ollama request model", async () => {
    process.env.OLLAMA_EMBED_MODEL = "custom-embedder";
    nextEmbeddings = [[3, 4,],];
    resetEmbedBodies();

    await embedText("model override",);

    expect(lastEmbedBody?.model,).toBe("custom-embedder",);
  });
});

// ── rankBySimilarity ────────────────────────────────────────────────────────

describe("rankBySimilarity", () => {
  const unitA = new Float32Array([0.6, 0.8,],);
  const unitB = new Float32Array([0.8, -0.6,],);
  const unitC = new Float32Array([1, 0,],);

  test("scores candidates by dot product and sorts descending", () => {
    const matches = rankBySimilarity(
      [
        { memoryId: "b", vector: unitB, },
        { memoryId: "a", vector: unitA, },
        { memoryId: "c", vector: unitC, },
      ],
      unitA,
      10,
      0,
    );
    expect(matches.map((m: SemanticMatch,) => m.memoryId),).toEqual(["a", "c", "b",],);
    expect(matches[0]?.score,).toBeCloseTo(1, 5,);
    expect(matches[1]?.score,).toBeCloseTo(0.6, 5,);
    expect(matches[2]?.score,).toBeCloseTo(0, 5,);
  });

  test("filters below minScore", () => {
    const matches = rankBySimilarity(
      [
        { memoryId: "a", vector: unitA, },
        { memoryId: "b", vector: unitB, },
      ],
      unitA,
      10,
      0.5,
    );
    expect(matches.map((m,) => m.memoryId),).toEqual(["a",],);
  });

  test("topK caps the result list", () => {
    const candidates = ["a", "b", "c",].map((id,) => ({ memoryId: id, vector: unitA, }));
    const matches = rankBySimilarity(candidates, unitA, 2, 0,);
    expect(matches,).toHaveLength(2,);
  });

  test("empty candidate list returns empty matches", () => {
    expect(rankBySimilarity([], unitA, 10, 0,),).toEqual([],);
  });

  test("damaged candidate vectors (dimension mismatch) do not crash — score degrades via ?? 0", () => {
    const truncated = new Float32Array([0.6,],);
    const matches = rankBySimilarity(
      [
        { memoryId: "short", vector: truncated, },
        { memoryId: "full", vector: unitA, },
      ],
      unitA,
      10,
      0,
    );
    expect(matches,).toHaveLength(2,);
    expect(matches[0]?.memoryId,).toBe("full",);
  });
});

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
  });

  test("upserts on the same memory_id instead of duplicating", async () => {
    await storeEmbedding(db, "mem-emb-2", new Float32Array([1, 2, 3, 4,],), "model-a",);
    await storeEmbedding(db, "mem-emb-2", new Float32Array([9, 9,],), "model-b",);

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
  });

  test("uses the default model name when omitted", async () => {
    await storeEmbedding(db, "mem-emb-3", new Float32Array([1,],),);
    const row = await db
      .selectFrom("memory_embeddings",)
      .select("model",)
      .where("memory_id", "=", "mem-emb-3",)
      .executeTakeFirst();
    expect(row?.model,).toBe("nomic-embed-text",);
  });

  test("returns an empty map for an empty id list without querying", async () => {
    const vectors = await getStoredVectors(db, [],);
    expect(vectors.size,).toBe(0,);
  });

  test("decodes a truncated blob (byte length not a multiple of 4) by flooring dims", async () => {
    // 6 raw bytes → floor(6 / 4) = 1 float32 (second float is incomplete).
    await db
      .insertInto("memory_embeddings",)
      .values({
        memory_id: "mem-truncated",
        model: "test-model",
        dimensions: 2,
        vector_blob: Buffer.from([0, 0, 128, 63, 255, 255,],),
        created_at: Math.floor(Date.now() / 1000,),
      },)
      .execute();

    const vectors = await getStoredVectors(db, ["mem-truncated",],);
    const vec = vectors.get("mem-truncated",);
    expect(vec?.length,).toBe(1,);
    expect(vec?.[0],).toBeCloseTo(1, 5,); // 0x3f800000 little-endian = 1.0
  });

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
  });
});

// ── semanticRecall pipeline ─────────────────────────────────────────────────

describe("semanticRecall", () => {
  let db: Kysely<DB>;
  let sqlite: { close(): void };

  beforeAll(async () => {
    createLogger({ level: "error", },);
    const ctx = await createTestDb();
    db = ctx.db;
    sqlite = ctx.sqlite;
    await insertActors(db, "Rerank Actor", { id: "actor-rerank", },);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("returns empty matches for an empty candidate list without embedding the query", async () => {
    nextEmbeddings = [[1, 0,],];
    resetEmbedBodies();
    const matches = await semanticRecall(db, [], "unused query",);
    expect(matches,).toEqual([],);
    expect(lastEmbedBody,).toBeUndefined();
  });

  test("ranks stored vectors against the embedded query and applies minScore + topK", async () => {
    // Query embeds to [0.6, 0.8]; candidates: perfect match, partial, orthogonal.
    nextEmbeddings = [[0.6, 0.8,],];
    await storeEmbedding(db, "recall-a", new Float32Array([0.6, 0.8,],), "m",);
    await storeEmbedding(db, "recall-b", new Float32Array([1, 0,],), "m",);
    await storeEmbedding(db, "recall-c", new Float32Array([0.8, -0.6,],), "m",);

    const matches = await semanticRecall(db, ["recall-a", "recall-b", "recall-c",], "find similar", 10, 0.3,);

    expect(matches.map((m,) => m.memoryId),).toEqual(["recall-a", "recall-b",],);
    expect(matches[0]?.score,).toBeCloseTo(1, 4,);
    expect(matches[1]?.score,).toBeCloseTo(0.6, 4,);
  });

  test("topK truncates the ranked list", async () => {
    nextEmbeddings = [[0.6, 0.8,],];
    const matches = await semanticRecall(db, ["recall-a", "recall-b",], "top k", 1, 0,);
    expect(matches,).toHaveLength(1,);
    expect(matches[0]?.memoryId,).toBe("recall-a",);
  });

  /** Seed an actor_memories row so rerank can fetch document text. */
  async function seedRerankMemory(id: string, content: string,): Promise<void> {
    await db
      .insertInto("actor_memories",)
      .values({
        id,
        actor_id: "actor-rerank",
        content,
        memory_type: "episodic",
        confidence: 1,
        importance: 1,
        keywords: "[]",
        scope: "character",
        privacy: "shared",
        pinned: "unpinned",
      },)
      .execute();
  }

  test("RERANK_MODEL reorders matches via the rerank endpoint", async () => {
    process.env.RERANK_MODEL = "bge-reranker-under-test";
    nextEmbeddings = [[0.6, 0.8,],];
    // Cosine order vs query [0.6, 0.8]: rerank-1 (1.0), rerank-2 (0.6), rerank-3 (0).
    await storeEmbedding(db, "rerank-1", new Float32Array([0.6, 0.8,],), "m",);
    await storeEmbedding(db, "rerank-2", new Float32Array([1, 0,],), "m",);
    await storeEmbedding(db, "rerank-3", new Float32Array([0.8, -0.6,],), "m",);
    await seedRerankMemory("rerank-1", "blue text",);
    await seedRerankMemory("rerank-2", "red text",);
    await seedRerankMemory("rerank-3", "green text",);
    nextRerank = { results: [{ index: 1, relevance_score: 0.99, }, { index: 0, relevance_score: 0.42, },], };
    rerankHits = 0;

    const matches = await semanticRecall(db, ["rerank-1", "rerank-2", "rerank-3",], "rerank me", 2, 0.3,);

    expect(rerankHits,).toBe(1,);
    expect(lastRerankBody?.model,).toBe("bge-reranker-under-test",);
    expect(lastRerankBody?.query,).toBe("rerank me",);
    // Documents arrive in cosine order; rerank-3 (0.0) is filtered by minScore
    // before the shortlist, so only the two surviving matches are reranked.
    expect(lastRerankBody?.documents,).toEqual(["blue text", "red text",],);
    expect(lastRerankBody?.top_n,).toBe(2,);
    // Rerank order wins and carries rerank scores, not cosine scores.
    expect(matches.map((m,) => m.memoryId),).toEqual(["rerank-2", "rerank-1",],);
    expect(matches[0]?.score,).toBeCloseTo(0.99, 5,);
    expect(matches[1]?.score,).toBeCloseTo(0.42, 5,);
  });

  test("rerank failure fails open to the cosine order and scores", async () => {
    process.env.RERANK_MODEL = "bge-reranker-under-test";
    nextEmbeddings = [[0.6, 0.8,],];
    nextRerank = null; // fake server responds 500
    rerankHits = 0;

    const matches = await semanticRecall(db, ["rerank-1", "rerank-2", "rerank-3",], "fail open", 2, 0.3,);

    expect(rerankHits,).toBe(1,);
    expect(matches.map((m,) => m.memoryId),).toEqual(["rerank-1", "rerank-2",],);
    expect(matches[0]?.score,).toBeCloseTo(1, 4,);
    expect(matches[1]?.score,).toBeCloseTo(0.6, 4,);
  });

  test("missing actor_memories text fails open instead of crashing", async () => {
    process.env.RERANK_MODEL = "bge-reranker-under-test";
    nextEmbeddings = [[0.6, 0.8,],];
    // Stored vector without an actor_memories row.
    await storeEmbedding(db, "rerank-ghost", new Float32Array([1, 0,],), "m",);
    nextRerank = { results: [{ index: 0, relevance_score: 1, },], };
    rerankHits = 0;

    const matches = await semanticRecall(db, ["rerank-ghost", "rerank-1",], "ghost", 2, 0.3,);

    expect(rerankHits,).toBe(0,);
    expect(matches.map((m,) => m.memoryId),).toEqual(["rerank-1", "rerank-ghost",],);
    expect(matches[0]?.score,).toBeCloseTo(1, 4,);
  });

  test("no RERANK_MODEL keeps rerank disabled with zero fetches", async () => {
    delete process.env.RERANK_MODEL;
    nextEmbeddings = [[0.6, 0.8,],];
    rerankHits = 0;

    const matches = await semanticRecall(db, ["rerank-1", "rerank-2", "rerank-3",], "disabled", 2, 0.3,);

    expect(rerankHits,).toBe(0,);
    expect(matches.map((m,) => m.memoryId),).toEqual(["rerank-1", "rerank-2",],);
    expect(matches[0]?.score,).toBeCloseTo(1, 4,);
  });
});
