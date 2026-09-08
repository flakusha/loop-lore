// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Search ranking primitives — pure and isomorphic.
 *
 * `reciprocalRankFusion` powers `hybrid` mode in the backend service;
 * `fuzzyScore` is the T2 baseline the gallery frontend uses until the
 * trigram-FTS migration lands (server-side ranking then replaces it, same
 * score range so the UI cutoff is unchanged); `bm25ToScore` normalizes raw
 * FTS5 ranks into the shared [0, 1] hit range.
 */
import type { SearchHit, } from "./types";

/** Default RRF damping constant (standard literature value). */
export const RRF_K = 60;

/**
 * Fuse ranked lists via reciprocal rank fusion.
 * Score = Σ 1 / (k + rank), normalized to [0, 1] by list count.
 * Same-row hits collapse to one entry with `source: "fused"`.
 * @param lists - ranked lists from each tier (keyword, vector, token)
 * @param topK - max fused hits to return
 * @param k - RRF damping constant
 * @returns fused hits sorted by score descending
 * @example
 * ```ts
 * reciprocalRankFusion([[keywordHit], [vectorHit]], 10);
 * ```
 */
export function reciprocalRankFusion<T,>(
  lists: SearchHit<T>[][],
  topK = 20,
  k: number = RRF_K,
): SearchHit<T>[] {
  const acc = new Map<string, { hit: SearchHit<T>; fused: number }>();
  for (const list of lists) {
    list.forEach((hit, rank,) => {
      const prev = acc.get(hit.id,);
      const fused = (prev?.fused ?? 0) + 1 / (k + rank + 1);
      acc.set(hit.id, { hit, fused, },);
    },);
  }
  const denom = lists.length > 0 ? lists.length / (k + 1) : 1;
  return Array.from(acc.values(),)
    .map(({ hit, fused, },) => ({
      ...hit,
      source: "fused" as const,
      score: Math.min(1, fused / denom,),
    }))
    .sort((a, b,) => b.score - a.score)
    .slice(0, topK,);
}

/**
 * Baseline fuzzy score for one haystack in [0, 1).
 * Exact (case-insensitive) matches score exactly 1; everything else stays
 * below 1 with earlier + token-prefix hits outranking later substrings.
 * Typo tolerance beyond prefix is NOT covered — that arrives with trigram
 * FTS (backend) per the unified-service ticket.
 * @param query - raw user input
 * @param haystack - candidate text (asset name, character name, …)
 * @returns 1 for exact match, (0, 1) for substring, 0 for no match
 * @example
 * ```ts
 * fuzzyScore("tav", "Tavern interior"); // → 0.95 (prefix at 0)
 * ```
 */
export function fuzzyScore(query: string, haystack: string,): number {
  const q = query.trim().toLowerCase();
  const h = haystack.toLowerCase();
  if (!q || !h) { return 0; }
  if (q === h) { return 1; }
  const idx = h.indexOf(q,);
  if (idx === -1) { return 0; }
  const positional = 0.5 * (1 - idx / h.length);
  const prefixBonus = h.split(/\s+/,).some((w,) => w.startsWith(q,)) ? 0.15 : 0;
  return Math.min(0.95, 0.3 + positional + prefixBonus,);
}

/**
 * Normalize a raw FTS5 `bm25()` rank into the shared [0, 1] hit range.
 * `bm25()` returns negative values where lower is better; the negation is
 * therefore a non-negative rank where lower is better, mapped monotonically.
 * @param rank - negated bm25 value (≥ 0, lower is better)
 * @returns score in (0, 1], higher is better
 * @example
 * ```ts
 * bm25ToScore(-row.matchScore); // bm25() is negative
 * ```
 */
export function bm25ToScore(rank: number,): number {
  return 1 / (1 + Math.max(0, rank,));
}
