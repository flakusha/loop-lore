// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage for `src/memory/rerank.ts` against a fake llama.cpp /rerank server
 * (Bun.serve on an ephemeral port) — no module mocking, no external services.
 */

import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { clearModelRoleOverride, resolveModelRole, } from "../admin/model-roles";
import type { Config, } from "../config/schema";
import { ModelRole, } from "../db/enums-core";
import type { DB, } from "../db/schema";
import type { GenerationRoutingConfig, } from "../generation/routing/routing-config";
import { RERANKING, } from "../generation/routing/task-signal";
import { recordRanking, } from "../models/rankings";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertModelRoleOverrides, } from "../test-utils/insert-helpers";
import { OPENROUTER_BASE_URL, resolveBackgroundEndpoint, } from "./background-transport";
import { rerankViaLlamaCpp, resolveRerankModel, } from "./rerank";

/** One rerank result entry as either server dialect sends it. */
interface FakeRerankEntry {
  index: number;
  /** TEI-style score (honkbox `POST /v1/rerank`). */
  score?: number;
  /** Cohere/Jina-style score (llama.cpp, llama-swap). */
  relevance_score?: number;
  /** Optional echoed text (honkbox `return_text`). */
  text?: string;
}

/** Response the fake /rerank endpoint serves next (null → 500 error). */
let nextRerank: { results: FakeRerankEntry[] } | { error: string } | null = null;

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
    if (value === undefined) { delete process.env[key]; }
    else { process.env[key] = value; }
  }

  void server.stop(true,);
},);

describe("rerankViaLlamaCpp", () => {
  test("posts model/query/documents/top_n and maps results to ordered hits", async () => {
    nextRerank = { results: [{ index: 2, relevance_score: 0.9, }, { index: 0, relevance_score: 0.4, },], };
    rawBody = undefined;
    lastBody = undefined as typeof lastBody;

    const hits = await rerankViaLlamaCpp("who wrote it", ["a", "b", "c",], { topN: 2, },);

    expect(hits,).toEqual([{ index: 2, score: 0.9, }, { index: 0, score: 0.4, },],);
    expect(lastBody?.model,).toBe("bge-reranker-under-test",); // RERANK_MODEL default
    expect(lastBody?.query,).toBe("who wrote it",);
    expect(lastBody?.documents,).toEqual(["a", "b", "c",],);
    expect(lastBody?.top_n,).toBe(2,);
  });

  test("explicit baseUrl and model win over the env chain", async () => {
    process.env.RERANK_BASE_URL = "http://127.0.0.1:1"; // dead port — would fail if used
    nextRerank = { results: [{ index: 0, relevance_score: 1, },], };

    const hits = await rerankViaLlamaCpp("q", ["a",], {
      topN: 1,
      baseUrl: `http://127.0.0.1:${server.port}`,
      model: "custom-reranker",
    },);

    expect(hits,).toEqual([{ index: 0, score: 1, },],);
    expect(lastBody?.model,).toBe("custom-reranker",);
  });

  test("empty document list returns [] without a request", async () => {
    const hits = await rerankViaLlamaCpp("q", [], { topN: 3, },);

    expect(hits,).toEqual([],);
    expect(lastBody,).toBeUndefined();
  });

  test("throws when RERANK_MODEL is unset and no model option is given", async () => {
    delete process.env.RERANK_MODEL;

    expect(rerankViaLlamaCpp("q", ["a",], { topN: 1, },),).rejects.toThrow("RERANK_MODEL",);
  });

  test("throws on non-OK responses", async () => {
    expect(rerankViaLlamaCpp("q", ["a",], { topN: 1, },),).rejects.toThrow("HTTP 500",);
  });

  test("throws on a malformed response body", async () => {
    rawBody = { nope: true, };

    expect(rerankViaLlamaCpp("q", ["a",], { topN: 1, },),).rejects.toThrow("results",);
  });

  test("throws when a result index is out of range", async () => {
    rawBody = { results: [{ index: 9, relevance_score: 0.5, },], };

    expect(rerankViaLlamaCpp("q", ["a",], { topN: 1, },),).rejects.toThrow("index",);
  });

  test("throws when a result entry lacks a numeric score", async () => {
    rawBody = { results: [{ index: 0, },], };

    expect(rerankViaLlamaCpp("q", ["a",], { topN: 1, },),).rejects.toThrow("score",);
  });

  test("maps a honkbox-shaped score field onto the hit score and orders by it", async () => {
    // honkbox `POST /v1/rerank` returns `{ index, score, text }` per item —
    // no `relevance_score` anywhere on the wire.
    nextRerank = {
      results: [
        { index: 0, score: 0.2, text: "a", },
        { index: 1, score: 0.9, text: "b", },
        { index: 2, score: 0.5, text: "c", },
      ],
    };

    const hits = await rerankViaLlamaCpp("who wrote it", ["a", "b", "c",], { topN: 3, },);

    expect(hits,).toEqual([
      { index: 1, score: 0.9, },
      { index: 2, score: 0.5, },
      { index: 0, score: 0.2, },
    ],);
  });

  test("the honkbox score actually drives the order, not the server order", async () => {
    // Deliberately unsorted by score: only a real score read can order these.
    nextRerank = {
      results: [
        { index: 0, score: 0.1, },
        { index: 1, score: 0.8, },
        { index: 2, score: 0.4, },
      ],
    };

    const hits = await rerankViaLlamaCpp("q", ["a", "b", "c",], { topN: 3, },);

    expect(hits.map((hit,) => hit.index),).toEqual([1, 2, 0,],);
  });

  test("a garbage score is rejected instead of ranking on NaN", async () => {
    rawBody = { results: [{ index: 0, score: "high", },], };

    expect(rerankViaLlamaCpp("q", ["a",], { topN: 1, },),).rejects.toThrow("score",);
  });

  test("a non-numeric relevance_score is rejected too", async () => {
    rawBody = { results: [{ index: 0, relevance_score: "0.5", },], };

    expect(rerankViaLlamaCpp("q", ["a",], { topN: 1, },),).rejects.toThrow("score",);
  });
});

// ── dedicated rerank role + task signal ──────────────────────────────────────

describe("dedicated rerank role", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    sqlite = testDb.sqlite;
  },);

  afterAll(() => {
    sqlite.close();
  },);

  /** Minimal Config sufficient for role resolution. */
  function configWith(generation: Record<string, unknown>,): Config {
    return { generation, } as unknown as Config;
  }

  test("an explicit rerank role wins over the env model on the wire", async () => {
    const config = configWith({
      modelRoles: { rerank: { provider: "role-provider", model: "role-reranker", }, },
    },);

    const model = await resolveRerankModel(config, db,);
    expect(model,).toBe("role-reranker",);

    nextRerank = { results: [{ index: 0, relevance_score: 1, },], };
    await rerankViaLlamaCpp("q", ["a",], { topN: 1, model, },);
    expect(lastBody?.model,).toBe("role-reranker",);
  });

  test("a missing role keeps the legacy env fallback", async () => {
    const config = configWith({
      defaultProvider: "p",
      defaultModels: { p: "server-default", },
    },);

    expect(await resolveRerankModel(config, db,),).toBeUndefined();
    expect(process.env.RERANK_MODEL,).toBe("bge-reranker-under-test",);
  });

  test("the general autoroute scenario never couples into the rerank model", async () => {
    await recordRanking(db, {
      scope: "global",
      scopeKey: "",
      subjectKey: "hf:org/general-ranked-model",
      metric: "quality_score",
      value: 0.9,
      basis: "imported",
      source: "livebench",
      observedAt: "2026-11-01T00:00:00.000Z",
    },);

    const config = configWith({
      defaultProvider: "p",
      defaultModels: { p: "general-ranked-model", },
      autorouteScenario: "general",
    },);

    // The scenario ranks a model for ordinary roles ...
    const main = await resolveModelRole(ModelRole.Main, config, db,);
    expect(main.source,).toBe("ranking",);
    expect(main.model,).toBe("general-ranked-model",);
    // ... but rerank never adopts it: only an explicit role wins.
    expect(await resolveRerankModel(config, db,),).toBeUndefined();
  });

  test("a DB override outranks the config role", async () => {
    await insertModelRoleOverrides(db, "db-provider", "db-reranker", { role: ModelRole.Rerank, },);
    const config = configWith({
      modelRoles: { rerank: { provider: "role-provider", model: "role-reranker", }, },
    },);

    expect(await resolveRerankModel(config, db,),).toBe("db-reranker",);
    await clearModelRoleOverride(ModelRole.Rerank, db,);
  });
});

describe("rerank routing signal", () => {
  /** Routing policy that rotates one task type's candidate order. */
  function roundRobin(taskType: string,): GenerationRoutingConfig {
    return {
      strategy: "capability-match",
      rules: [{ taskType, strategy: "round-robin", },],
    };
  }

  test("a rule on the reranking signal fires and rotates endpoints", () => {
    process.env.RERANK_BASE_URL = "http://127.0.0.1:1111";
    process.env.EMBEDDINGS_BASE_URL = "http://127.0.0.1:2222";
    const envNames = ["RERANK_BASE_URL", "EMBEDDINGS_BASE_URL", "OLLAMA_BASE_URL",];
    const routing = roundRobin("reranking",);

    expect(resolveBackgroundEndpoint(envNames, { routing, signal: RERANKING, },),).toBe("http://127.0.0.1:1111",);
    expect(resolveBackgroundEndpoint(envNames, { routing, signal: RERANKING, },),).toBe("http://127.0.0.1:2222",);
  });

  test("a background rule does not reroute the reranking signal", () => {
    process.env.RERANK_BASE_URL = "http://127.0.0.1:1111";
    process.env.EMBEDDINGS_BASE_URL = "http://127.0.0.1:2222";
    const routing = roundRobin("background",);
    const envNames = ["RERANK_BASE_URL", "EMBEDDINGS_BASE_URL",];

    const first = resolveBackgroundEndpoint(envNames, { routing, signal: RERANKING, },);
    const second = resolveBackgroundEndpoint(envNames, { routing, signal: RERANKING, },);
    expect(first,).toBe(second,);
  });

  test("the OpenRouter default is a routed candidate, not a bypass", () => {
    const routing = roundRobin("reranking",);
    delete process.env.RERANK_BASE_URL;
    expect(resolveBackgroundEndpoint(["RERANK_BASE_URL",], {
      routing,
      signal: RERANKING,
      defaultUrl: OPENROUTER_BASE_URL,
    },),).toBe(OPENROUTER_BASE_URL,);

    const local = `http://127.0.0.1:${server.port}`;
    process.env.RERANK_BASE_URL = local;
    expect(resolveBackgroundEndpoint(["RERANK_BASE_URL",], {
      routing,
      signal: RERANKING,
      defaultUrl: OPENROUTER_BASE_URL,
    },),).toBe(local,);

    expect(resolveBackgroundEndpoint(["RERANK_BASE_URL",], {
      routing,
      signal: RERANKING,
      defaultUrl: OPENROUTER_BASE_URL,
    },),).toBe(OPENROUTER_BASE_URL,);
  });
});
