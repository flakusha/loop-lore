// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage for `src/memory/rerank.ts` against a fake llama.cpp /rerank server
 * (Bun.serve on an ephemeral port) — no module mocking, no external services.
 */

import { afterAll, beforeEach, describe, expect, test, } from "bun:test";
import { rerankViaLlamaCpp, } from "./rerank";

/** Response the fake /rerank endpoint serves next (null → 500 error). */
let nextRerank: { results: { index: number; relevance_score: number }[] } | { error: string } | null = null;

/** Raw 200-body override for malformed-response cases. */
let rawBody: unknown;

/** Last JSON body received by the fake /rerank endpoint. */
let lastBody: {
  model?: string;
  query?: string;
  documents?: string[];
  top_n?: number;
} | undefined;

const server = Bun.serve({
  port: 0,
  fetch: async (req,) => {
    if (new URL(req.url,).pathname !== "/rerank") {
      return new Response("not found", { status: 404, },);
    }
    lastBody = await req.json() as typeof lastBody;
    if (rawBody !== undefined) { return Response.json(rawBody,); }
    if (nextRerank === null) {
      return Response.json({ error: "reranker not loaded", }, { status: 500, },);
    }
    if ("error" in nextRerank) {
      return Response.json(nextRerank, { status: 500, },);
    }
    return Response.json(nextRerank,);
  },
},);

/** Env knobs mutated by these tests, captured before any test runs. */
const ORIGINAL_ENV: Record<string, string | undefined> = {
  EMBEDDINGS_BASE_URL: process.env.EMBEDDINGS_BASE_URL,
  RERANK_BASE_URL: process.env.RERANK_BASE_URL,
  RERANK_MODEL: process.env.RERANK_MODEL,
};

beforeEach(() => {
  // No explicit baseUrl in most tests: the endpoint must resolve via the
  // RERANK_BASE_URL → EMBEDDINGS_BASE_URL → OLLAMA_BASE_URL chain.
  nextRerank = null;
  rawBody = undefined;
  lastBody = undefined;
  process.env.EMBEDDINGS_BASE_URL = `http://127.0.0.1:${server.port}`;
  process.env.RERANK_MODEL = "bge-reranker-under-test";
  delete process.env.RERANK_BASE_URL;
},);

afterAll(() => {
  for (const [key, value,] of Object.entries(ORIGINAL_ENV,)) {
    if (value === undefined) { delete process.env[key]; } else { process.env[key] = value; }
  }
  void server.stop(true,);
},);

describe("rerankViaLlamaCpp", () => {
  test("posts model/query/documents/top_n and maps results to ordered hits", async () => {
    nextRerank = { results: [{ index: 2, relevance_score: 0.9, }, { index: 0, relevance_score: 0.4, },] };
    rawBody = undefined;
    lastBody = undefined as typeof lastBody;

    const hits = await rerankViaLlamaCpp("who wrote it", ["a", "b", "c",], { topN: 2, },);

    expect(hits,).toEqual([{ index: 2, score: 0.9, }, { index: 0, score: 0.4, },],);
    expect(lastBody?.model,).toBe("bge-reranker-under-test"); // RERANK_MODEL default
    expect(lastBody?.query,).toBe("who wrote it");
    expect(lastBody?.documents,).toEqual(["a", "b", "c",],);
    expect(lastBody?.top_n,).toBe(2,);
  });

  test("explicit baseUrl and model win over the env chain", async () => {
    process.env.RERANK_BASE_URL = "http://127.0.0.1:1"; // dead port — would fail if used
    nextRerank = { results: [{ index: 0, relevance_score: 1, },] };

    const hits = await rerankViaLlamaCpp("q", ["a",], {
      topN: 1,
      baseUrl: `http://127.0.0.1:${server.port}`,
      model: "custom-reranker",
    },);

    expect(hits,).toEqual([{ index: 0, score: 1, },],);
    expect(lastBody?.model,).toBe("custom-reranker");
  });

  test("empty document list returns [] without a request", async () => {
    const hits = await rerankViaLlamaCpp("q", [], { topN: 3, },);

    expect(hits,).toEqual([],);
    expect(lastBody,).toBeUndefined();
  });

  test("throws when RERANK_MODEL is unset and no model option is given", async () => {
    delete process.env.RERANK_MODEL;

    expect(rerankViaLlamaCpp("q", ["a",], { topN: 1, },),).rejects.toThrow("RERANK_MODEL");
  });

  test("throws on non-OK responses", async () => {
    expect(rerankViaLlamaCpp("q", ["a",], { topN: 1, },),).rejects.toThrow("HTTP 500");
  });

  test("throws on a malformed response body", async () => {
    rawBody = { nope: true };

    expect(rerankViaLlamaCpp("q", ["a",], { topN: 1, },),).rejects.toThrow("results");
  });

  test("throws when a result index is out of range", async () => {
    rawBody = { results: [{ index: 9, relevance_score: 0.5, },] };

    expect(rerankViaLlamaCpp("q", ["a",], { topN: 1, },),).rejects.toThrow("index");
  });

  test("throws when a result entry lacks relevance_score", async () => {
    rawBody = { results: [{ index: 0, },] };

    expect(rerankViaLlamaCpp("q", ["a",], { topN: 1, },),).rejects.toThrow("relevance_score");
  });
});
