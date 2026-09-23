// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Cross-encoder rerank via the llama.cpp `/rerank` endpoint (llama-server /
 * llama-swap).  Rerank scores are model-specific and never comparable to
 * cosine similarity — callers fail open to the cosine ordering on any error.
 */

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
}

/**
 * Rerank documents against a query with a cross-encoder served by llama.cpp.
 * @param query
 * @param docs
 * @param opts
 * @throws On timeout/transport failure, non-OK status, unset RERANK_MODEL, or
 *   a malformed response.
 */
export async function rerankViaLlamaCpp(
  query: string,
  docs: string[],
  opts: RerankOptions,
): Promise<RerankHit[]> {
  if (docs.length === 0) { return []; }
  const model = opts.model ?? process.env.RERANK_MODEL;
  if (!model) { throw new Error("RERANK_MODEL is not set; rerank is disabled.",); }
  const baseUrl = opts.baseUrl ?? process.env.RERANK_BASE_URL
    ?? process.env.EMBEDDINGS_BASE_URL ?? process.env.OLLAMA_BASE_URL
    ?? "http://localhost:11434";
  const response = await fetch(`${baseUrl}/rerank`, {
    method: "POST",
    headers: { "content-type": "application/json", },
    body: JSON.stringify({ model, query, documents: docs, top_n: opts.topN, },),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 2000,),
  },);
  if (!response.ok) {
    throw new Error(`Rerank endpoint returned HTTP ${response.status}.`,);
  }
  const payload = await response.json() as {
    results?: { index?: unknown; relevance_score?: unknown }[];
  };
  if (!Array.isArray(payload.results,)) {
    throw new Error("Rerank response is missing a results array.",);
  }
  return payload.results.map((entry,) => {
    const { index, relevance_score: score, } = entry;
    if (typeof index !== "number" || index < 0 || index >= docs.length) {
      throw new Error(`Rerank result index ${String(index,)} is out of range.`,);
    }
    if (typeof score !== "number") {
      throw new Error("Rerank result entry is missing relevance_score.",);
    }
    return { index, score };
  },);
}
