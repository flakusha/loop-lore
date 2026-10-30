/**
 * Global board scores for the admin providers surface — the
 * global-scope counterpart to `fit-lookup.ts` (instance scope).
 *
 * Same fuzzy identity by design: board subject keys (`hf:<org>/<name>`)
 * and provider model ids come from different catalogs. A miss degrades
 * to null — a stale global rank must never override the local fit
 * verdict, so the two render as separate badges.
 *
 * ponytail: substring match; exact provider↔board identity map when
 * provider catalogs standardize on a shared model identity.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { latestRankings, } from "./rankings";

/** Board score attached to one provider-listed model (null when unknown). */
export interface GlobalScore {
  value: number;
  source: string;
  observedAt: string;
}

/**
 * Latest global `quality_score` rows keyed by lowercase subject.
 * @param db
 */
type ScoreRow = Awaited<ReturnType<typeof latestRankings>>[number];

async function scoreIndex(db: Kysely<DB>,): Promise<Map<string, ScoreRow>> {
  const rows = await latestRankings(db, { scope: "global", metric: "quality_score", },);
  const index = new Map<string, ScoreRow>();
  for (const row of rows) {
    index.set(row.subject_key.toLowerCase(), row,);
  }

  return index;
}

/**
 * Attach global board scores to provider model ids.
 * @param db
 * @param modelIds - provider-listed model ids
 * @returns map from model id to score (null when no board row matches)
 */
export async function globalScoresForModels(
  db: Kysely<DB>,
  modelIds: string[],
): Promise<Map<string, GlobalScore | null>> {
  const index = await scoreIndex(db,);
  const out = new Map<string, GlobalScore | null>();
  for (const id of modelIds) {
    const needle = id.toLowerCase();
    let hit: ScoreRow | null = null;
    for (const [subject, row,] of index) {
      if (subject.includes(needle,) || needle.includes(subject.replace(/^hf:/, "",).split("|",)[0] ?? "",)) {
        hit = row;
        break;
      }
    }

    out.set(id, hit ? { value: hit.value, source: hit.source, observedAt: hit.observed_at, } : null,);
  }

  return out;
}
