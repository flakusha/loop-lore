// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * In-process store for A/B comparison runs (FEAT-060).
 *
 * Each run captures the full side-by-side results plus ratings and
 * notes. Persistence is process-local; comparison sessions are
 * short-lived (run → rate → export). A persistent backing store is
 * a follow-up that requires a migration (out of scope for FEAT-060).
 */

export interface ComparisonResult {
  model: { provider: string; name: string };
  response: string;
  latencyMs: number;
  tokenCount: number;
  cost: number;
  status: "success" | "error";
  error?: string;
  metadata: { kind: "ab" | "sweep" };
}

export interface ComparisonRun {
  id: string;
  userId: string;
  prompt: string;
  results: ComparisonResult[];
  ratings: Record<string, { rating: number; notes: string }>;
  sweep: boolean;
  createdAt: string;
}

const runs = new Map<string, ComparisonRun>();

export function saveRun(run: ComparisonRun,): void {
  runs.set(run.id, run,);
}

export function getRun(id: string,): ComparisonRun | undefined {
  return runs.get(id,);
}

export function listRuns(userId: string, limit: number,): ComparisonRun[] {
  return Array.from(runs.values(),)
    .filter((r,) => r.userId === userId)
    .sort((a, b,) => b.createdAt.localeCompare(a.createdAt,))
    .slice(0, limit,);
}

export function setRating(
  runId: string,
  modelName: string,
  rating: number,
  notes: string,
): boolean {
  const run = runs.get(runId,);
  if (!run) { return false; }
  run.ratings[modelName] = { rating, notes, };
  return true;
}

/** Test helper — clears all runs. */
export function clearRuns(): void {
  runs.clear();
}
