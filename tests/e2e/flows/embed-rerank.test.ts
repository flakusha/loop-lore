// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E: memory embeddings + rerank transport.
 *
 * Tier 1 (always runs, no network): a local fake server proves the
 * OpenAI-compatible transport is unchanged when no key is configured (no
 * Authorization header) and that the OpenRouter rerank wire sends the
 * Cohere-style body, the Bearer header, and maps `results[].relevance_score`
 * back to relevance order.
 *
 * Tier 2 (creds-gated): with a shared OpenRouter key set, embed a real text
 * and rerank two documents live; the higher-relevance document must come
 * first. Skip tier 2: leave the key blank or set E2E_EMBED_SKIP=1.
 *
 * Env knobs: E2E_EMBEDDINGS_KEY / BYOK_E2E_API_KEY (key), E2E_EMBED_MODEL
 * (default nvidia/nemotron-3.5-embed-1b:free), E2E_RERANK_MODEL (default
 * nvidia/nemotron-3.5-rerank-8b:free), E2E_RERANK_PROVIDER=openrouter.
 */

import { embedText, } from "@/memory/embed-provider";
import { rerankViaLlamaCpp, } from "@/memory/rerank";
import { afterAll, afterEach, describe, expect, test, } from "bun:test";

const KEY = process.env.E2E_EMBEDDINGS_KEY ?? process.env.BYOK_E2E_API_KEY ?? "";
const EMBED_MODEL = process.env.E2E_EMBED_MODEL ?? "nvidia/nemotron-3.5-embed-1b:free";
const RERANK_MODEL = process.env.E2E_RERANK_MODEL ?? "nvidia/nemotron-3.5-rerank-8b:free";
const OR_BASE = "https://openrouter.ai/api/v1";
const LIVE = KEY !== "" && process.env.E2E_EMBED_SKIP !== "1";
const describeLive = LIVE ? describe : describe.skip;

/** Env knobs mutated by the tests, captured before any test runs. */
const ORIGINAL_ENV: Record<string, string | undefined> = {
  EMBEDDINGS_API: process.env.EMBEDDINGS_API,
  EMBEDDINGS_BASE_URL: process.env.EMBEDDINGS_BASE_URL,
  EMBEDDINGS_INPUT_TYPE: process.env.EMBEDDINGS_INPUT_TYPE,
  OLLAMA_EMBED_MODEL: process.env.OLLAMA_EMBED_MODEL,
  RERANK_BASE_URL: process.env.RERANK_BASE_URL,
  RERANK_MODEL: process.env.RERANK_MODEL,
  E2E_EMBEDDINGS_KEY: process.env.E2E_EMBEDDINGS_KEY,
  BYOK_E2E_API_KEY: process.env.BYOK_E2E_API_KEY,
  E2E_RERANK_KEY: process.env.E2E_RERANK_KEY,
  E2E_RERANK_PROVIDER: process.env.E2E_RERANK_PROVIDER,
};

/** Last Authorization header seen by the fake server (undefined = none). */
let lastAuth: string | undefined;

/** Last JSON body seen by the fake /rerank endpoint. */
let lastRerankBody: {
  model?: string;
  query?: string;
  documents?: string[];
  top_n?: number;
} | undefined;

const fake = Bun.serve({
  port: 0,
  fetch: async (req,) => {
    lastAuth = req.headers.get("authorization",) ?? undefined;
    const { pathname, } = new URL(req.url,);
    if (pathname === "/v1/embeddings") {
      await req.json();
      return Response.json({ data: [{ embedding: [3, 4,], },], },);
    }

    if (pathname === "/v1/rerank") {
      lastRerankBody = await req.json() as typeof lastRerankBody;
      // Unsorted on purpose: the mapping must restore relevance order.
      return Response.json({
        results: [{ index: 0, relevance_score: 0.1, }, { index: 1, relevance_score: 0.9, },],
      },);
    }

    return new Response("not found", { status: 404, },);
  },
},);

afterEach(() => {
  for (const [key, value,] of Object.entries(ORIGINAL_ENV,)) {
    if (value === undefined) { delete process.env[key]; }
    else { process.env[key] = value; }
  }

  lastAuth = undefined;
  lastRerankBody = undefined;
},);

afterAll(async () => {
  await fake.stop(true,);
},);

describe("memory embedding + rerank transport", () => {
  test("keyless OpenAI-compatible transport sends no Authorization header", async () => {
    delete process.env.E2E_EMBEDDINGS_KEY;
    delete process.env.BYOK_E2E_API_KEY;
    process.env.EMBEDDINGS_API = "openai";
    process.env.EMBEDDINGS_BASE_URL = `http://127.0.0.1:${fake.port}/v1`;

    const vec = await embedText("keyless me",);

    expect(vec.length,).toBe(2,);
    expect(vec[0],).toBeCloseTo(0.6, 5,);
    expect(lastAuth,).toBeUndefined();
  });

  test("openrouter rerank wire sends the Cohere body + Bearer and orders by relevance", async () => {
    process.env.E2E_RERANK_PROVIDER = "openrouter";
    process.env.E2E_RERANK_KEY = "test-key";
    process.env.RERANK_MODEL = "test-reranker";
    process.env.RERANK_BASE_URL = `http://127.0.0.1:${fake.port}/v1`;

    const hits = await rerankViaLlamaCpp("who wrote it", ["a", "b",], { topN: 2, },);

    expect(lastAuth,).toBe("Bearer test-key",);
    expect(lastRerankBody?.model,).toBe("test-reranker",);
    expect(lastRerankBody?.query,).toBe("who wrote it",);
    expect(lastRerankBody?.documents,).toEqual(["a", "b",],);
    expect(lastRerankBody?.top_n,).toBe(2,);
    expect(hits,).toEqual([{ index: 1, score: 0.9, }, { index: 0, score: 0.1, },],);
  });
});

describeLive("live OpenRouter embeddings + rerank", () => {
  test("embedText returns a normalised vector", async () => {
    process.env.EMBEDDINGS_API = "openai";
    process.env.EMBEDDINGS_BASE_URL = OR_BASE;
    process.env.OLLAMA_EMBED_MODEL = EMBED_MODEL;
    process.env.E2E_EMBEDDINGS_KEY = KEY;
    // NVIDIA Nemotron is asymmetric: queries and passages use different roles.
    process.env.EMBEDDINGS_INPUT_TYPE = "query";

    const vec = await embedText("What is the capital of France?",);

    expect(vec.length,).toBeGreaterThan(0,);
    let norm = 0;
    for (const value of vec) { norm += value * value; }

    expect(Math.sqrt(norm,),).toBeCloseTo(1, 3,);
  });

  test("rerank puts the higher-relevance document first", async () => {
    process.env.E2E_RERANK_PROVIDER = "openrouter";
    process.env.RERANK_MODEL = RERANK_MODEL;
    process.env.RERANK_BASE_URL = OR_BASE;
    process.env.E2E_RERANK_KEY = KEY;

    const hits = await rerankViaLlamaCpp(
      "Who wrote the tragedy Hamlet?",
      [
        "The mitochondrion is the powerhouse of the cell.",
        "Hamlet is a tragedy written by William Shakespeare.",
      ],
      { topN: 2, timeoutMs: 30_000, },
    );

    expect(hits.length,).toBeGreaterThan(0,);
    expect(hits[0]?.index,).toBe(1,);
  }, 60000,);
},);
