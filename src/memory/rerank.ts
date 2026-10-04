// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Cross-encoder rerank via the llama.cpp `/rerank` endpoint (llama-server /
 * llama-swap).  Rerank scores are model-specific and never comparable to
 * cosine similarity — callers fail open to the cosine ordering on any error.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../db";
import type { GenerationRoutingConfig, } from "../generation/routing/routing-config";
import { BACKGROUND, toHarnessTaskType, } from "../generation/routing/task-signal";
import { recordExecRun, } from "../harness/exec-recorder";
import { safeFetch, } from "../utils/safe-fetch";
import { resolveBackgroundEndpoint, } from "./background-transport";

/** One rerank result: input document position + model relevance score. */
export interface RerankHit {
  index: number;
  score: number;
}

/** Options for rerankViaLlamaCpp. */
export interface RerankOptions {
  /** Max documents to return. */
  topN: number;
  /** Fetch timeout in ms (default 2000). */
  timeoutMs?: number;
  /** Base URL; defaults to RERANK_BASE_URL → EMBEDDINGS_BASE_URL → OLLAMA_BASE_URL. */
  baseUrl?: string;
  /** Rerank model; defaults to RERANK_MODEL. */
  model?: string;
  /** Routing policy used to order the endpoint candidates (default: env precedence). */
  routing?: GenerationRoutingConfig;
}

/**
 * Rerank documents against a query with a cross-encoder served by llama.cpp.
 * @param query
 * @param docs
 * @param opts
 * @throws On timeout/transport failure, non-OK status, unset RERANK_MODEL, or
 *   a malformed response.
 * @returns {Promise<RerankHit[]>}
 */
export async function rerankViaLlamaCpp(
  query: string,
  docs: string[],
  opts: RerankOptions,
): Promise<RerankHit[]> {
  if (docs.length === 0) { return []; }
  const model = opts.model ?? process.env.RERANK_MODEL;
  if (!model) { throw new Error("RERANK_MODEL is not set; rerank is disabled.",); }
  // OFF the chat hot path: declare the `background` task signal so the router
  // orders these endpoint candidates instead of taking env precedence blindly.
  const baseUrl = opts.baseUrl ?? resolveBackgroundEndpoint(
    ["RERANK_BASE_URL", "EMBEDDINGS_BASE_URL", "OLLAMA_BASE_URL",],
    { routing: opts.routing, model, },
  );
  // Exec log: rerank is a raw HTTP call, not an LLMProvider dispatch, so it
  // bypasses callWithFailover and records here. No cost metadata exists on a
  // raw endpoint call, so the record carries a null (unknown) cost rather than
  // an invented price.
  const startedAt = Date.now();
  const recordExec = (result: "ok" | "error", error: string | null,): void => {
    recordExecRun({
      taskType: toHarnessTaskType(BACKGROUND.taskType,),
      model,
      runMs: Date.now() - startedAt,
      result,
      error,
      task: "memory:rerank",
    },);
  };
  try {
    const result = await safeFetch<{ results?: { index?: unknown; relevance_score?: unknown }[] }>(
      `${baseUrl}/rerank`,
      {
        method: "POST",
        body: { model, query, documents: docs, top_n: opts.topN, },
        timeout: opts.timeoutMs ?? 2000,
      },
    );
    if (!result.ok) {
      recordExec("error", result.error.message,);
      throw new Error(`Rerank endpoint request failed: ${result.error.message}`,);
    }
    const payload = result.data;
    if (!Array.isArray(payload.results,)) {
      recordExec("error", "response missing results array",);
      throw new Error("Rerank response is missing a results array.",);
    }
    recordExec("ok", null,);
    return payload.results.map((entry,) => {
      const { index, relevance_score: score, } = entry;
      if (typeof index !== "number" || index < 0 || index >= docs.length) {
        recordExec("error", `result index ${String(index,)} out of range`,);
        throw new Error(`Rerank result index ${String(index,)} is out of range.`,);
      }
      if (typeof score !== "number") {
        recordExec("error", "entry missing relevance_score",);
        throw new Error("Rerank result entry is missing relevance_score.",);
      }
      return { index, score, };
    },);
  } catch (error) {
    recordExec("error", (error as Error).message,);
    throw error;
  }
}

/**
 * Fetch actor_memories content for the given ids, preserving order.
 * @param db
 * @param ids
 * @throws If any id has no row (rerank callers fail open).
 * @returns {Promise<string[]>}
 */
export async function fetchMemoryTexts(db: Kysely<DB>, ids: string[],): Promise<string[]> {
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
