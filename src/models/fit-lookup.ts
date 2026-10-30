// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Fit lookup for the admin providers surface — attaches cached llmfit
 * verdicts to provider-listed models.
 *
 * Identity is fuzzy by design: llmfit catalog names
 * (`llmfit:<name>|ctx…` subject keys) and provider model ids come from
 * different catalogs, so the match is a case-insensitive substring on
 * the model id. A miss degrades to `fit: null`, never to a wrong
 * number.
 *
 * ponytail: substring match; exact provider↔catalog identity map when
 * provider catalogs standardize on a shared model identity.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { jsonParseOr, } from "../utils";
import { latestRankings, } from "./rankings";

/** Fit verdict attached to one provider-listed model (null when unknown). */
export interface ModelFit {
  score: number;
  fitLevel: string | null;
  estimatedTps: number | null;
  confidence: string | null;
  fingerprint: string;
}

/**
 * Latest cached fit verdicts keyed by lowercase model id fragment.
 * @param db
 */
type FitRow = Awaited<ReturnType<typeof latestRankings>>[number];

async function fitIndex(db: Kysely<DB>,): Promise<Map<string, FitRow>> {
  const rows = await latestRankings(db, { scope: "instance", metric: "fit_score", },);
  const index = new Map<string, FitRow>();
  for (const row of rows) {
    index.set(row.subject_key.toLowerCase(), row,);
  }

  return index;
}

/**
 * Attach fit verdicts to provider model ids.
 * @param db
 * @param modelIds - provider-listed model ids
 * @returns map from model id to verdict (null when no cached verdict matches)
 */
export async function fitForModels(db: Kysely<DB>, modelIds: string[],): Promise<Map<string, ModelFit | null>> {
  const index = await fitIndex(db,);
  const out = new Map<string, ModelFit | null>();
  for (const id of modelIds) {
    const needle = id.toLowerCase();
    let hit: FitRow | null = null;
    for (const [subject, row,] of index) {
      if (subject.includes(needle,) || needle.includes(subject.replace(/^llmfit:/, "",).split("|",)[0] ?? "",)) {
        hit = row;
        break;
      }
    }

    if (!hit) {
      out.set(id, null,);
      continue;
    }

    const meta = jsonParseOr<Record<string, unknown>>(hit.meta, {},);

    out.set(id, {
      score: hit.value,
      fitLevel: typeof meta["fit_level"] === "string" ? meta["fit_level"] : null,
      estimatedTps: typeof meta["estimated_tps"] === "number" ? meta["estimated_tps"] : null,
      confidence: typeof meta["estimate_confidence"] === "string" ? meta["estimate_confidence"] : null,
      fingerprint: hit.scope_key,
    },);
  }

  return out;
}
