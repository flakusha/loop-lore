// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Global Boards — keyless leaderboard ingestion into `model_rankings`.
 *
 * Thin registry over per-board modules: UGI, LiveBench, LiveCodeBench,
 * Hallucinations, LMArena (arena.ai stats via the published HF dataset
 * — never the site; `arena.ai/robots.txt` disallows `/api/`). Each
 * board row becomes one `model_rankings` row with scope='global',
 * basis='imported'. Re-exports keep old import paths working.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { importHallucinations, } from "./boards-hallucinations";
import { importLiveBench, } from "./boards-livebench";
import { importLiveCodeBench, } from "./boards-livecodebench";
import { importLmarena, } from "./boards-lmarena";
import { type FetchImpl, } from "./boards-shared";
import { importUgi, } from "./boards-ugi";

export {
  HALLUCINATIONS_REFRESH_MS,
  HALLUCINATIONS_TREE_URL,
  type HallucinationsRun,
  importHallucinations,
  parseHallucinationsTree,
} from "./boards-hallucinations";
export {
  importLiveBench,
  LIVEBENCH_REFRESH_MS,
  LIVEBENCH_RELEASES,
  LIVEBENCH_VERSION,
  type LiveBenchRow,
  parseLiveBenchCsv,
} from "./boards-livebench";
export {
  aggregateLiveCodeBench,
  importLiveCodeBench,
  LIVECODEBENCH_JSON_URL,
  LIVECODEBENCH_REFRESH_MS,
  type LiveCodeBenchAggregate,
} from "./boards-livecodebench";
export {
  importLmarena,
  LMARENA_CONFIG,
  LMARENA_DATASET,
  LMARENA_REFRESH_MS,
  LMARENA_ROWS_URL,
  type LmarenaRow,
  parseLmarenaPage,
} from "./boards-lmarena";
export { type FetchImpl, } from "./boards-shared";
export { importUgi, parseUgiCsv, parseUgiDate, UGI_CSV_URL, UGI_REFRESH_MS, type UgiRow, } from "./boards-ugi";

/**
 * Run every board importer in sequence. Per-board failures degrade
 * to 0 for that board — one dead board never blocks the rest.
 * @param db
 * @param fetchImpl - injectable for tests
 * @returns total new ranking rows written
 */
export async function importAllBoards(db: Kysely<DB>, fetchImpl: FetchImpl = fetch,): Promise<number> {
  let written = 0;
  written += await importUgi(db, fetchImpl,);
  written += await importLiveBench(db, fetchImpl,);
  written += await importLiveCodeBench(db, fetchImpl,);
  written += await importHallucinations(db, fetchImpl,);
  written += await importLmarena(db, fetchImpl,);
  return written;
}
