// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Scenario → model ranking: pick the best-ranked candidate model for a
 * named use case. An explicit operator/model override bypasses ranking.
 *
 * ponytail: substring identity match, same compromise as fit-lookup and
 * global-score; replace with a shared model-identity map when provider
 * catalogs standardize.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { toDate, } from "../utils/date";
import { latestRankings, } from "./rankings";

/**
 * Known scenarios and the ranking row that represents them.
 * `scope` is where the measurement lives: boards publish global rows,
 * fit/reaction grades are instance-local.
 */
export const SCENARIO_RANKINGS = {
  general: { metric: "quality_score", scope: "global", },
  chat: { metric: "arena_score", scope: "global", },
  coding: { metric: "pass_at_1", scope: "global", },
  local: { metric: "fit_score", scope: "instance", },
  observed: { metric: "reaction_rate", scope: "instance", },
} as const;

export type ScenarioKey = keyof typeof SCENARIO_RANKINGS;

/** A ranking-backed model choice. `bypassed` means an override won. */
export interface ScenarioRecommendation {
  modelId: string;
  metric: string;
  value: number | null;
  source: string;
  bypassed: boolean;
}

/**
 * Canonical model identity from a ranking subject or a configured model id.
 * Strips `provider:` prefixes and qualifier suffixes; keeps the namespaced
 * identity plus its leaf so bare configured ids compare exactly, not by substring.
 */
function modelIdentity(value: string,): { full: string; leaf: string } {
  const afterScheme = value.includes(":",) ? value.slice(value.indexOf(":",) + 1,) : value;
  const segments = (afterScheme.split("|",)[0] ?? "").trim().toLowerCase().split("/",);
  const leaf = segments[segments.length - 1] ?? "";
  return { full: segments.join("/",), leaf, };
}

/** A bare configured id matches a namespaced ranking subject by exact leaf, never substring. */
function sameModel(candidate: { full: string; leaf: string }, subject: { full: string; leaf: string },): boolean {
  return subject.full === candidate.full ||
    (!candidate.full.includes("/",) && subject.leaf === candidate.leaf);
}

/**
 * Resolve a model for a use-case scenario.
 *
 * Resolution order: an explicit override (when it names a candidate) wins
 * outright; otherwise the highest fresh ranking value among the candidates
 * wins. No ranking row, unknown scenario, or empty candidate list yields
 * null so callers keep their manual default.
 *
 * @param db - typed database
 * @param scenario - use-case name from {@link SCENARIO_RANKINGS}
 * @param candidates - provider model ids eligible for selection
 * @param opts - optional explicit model override (the ranking bypass)
 * @returns the recommendation, or null when nothing can be ranked
 */
export async function recommendScenarioModel(
  db: Kysely<DB>,
  scenario: string,
  candidates: readonly string[],
  opts: { overrideModel?: string | null } = {},
): Promise<ScenarioRecommendation | null> {
  const spec = SCENARIO_RANKINGS[scenario as ScenarioKey];
  if (spec === undefined || candidates.length === 0) { return null; }

  const override = opts.overrideModel?.trim();
  if (override && candidates.includes(override,)) {
    return { modelId: override, metric: spec.metric, value: null, source: "override", bypassed: true, };
  }

  const rows = await latestRankings(db, { scope: spec.scope, metric: spec.metric, },);
  const now = Date.now();
  let best: ScenarioRecommendation | null = null;

  for (const candidate of candidates) {
    const identity = modelIdentity(candidate,);
    for (const row of rows) {
      if (row.expires_at !== null && toDate(row.expires_at,).getTime() <= now) { continue; }
      const subject = modelIdentity(row.subject_key,);
      if (!sameModel(identity, subject,)) { continue; }
      if (best === null || row.value > (best.value ?? Number.NEGATIVE_INFINITY)) {
        best = {
          modelId: candidate,
          metric: spec.metric,
          value: row.value,
          source: row.source,
          bypassed: false,
        };
      }

      break;
    }
  }

  return best;
}
