// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness tab state (admin.html) — agent-harness run history + telemetry.
 *
 * Consumes three read-only endpoints: `/api/v1/harness/runs`, `/runs/:runId`,
 * `/api/v1/harness/stats`. All are admin-authenticated, so a 403 is a real
 * outcome to render rather than an error to swallow — `harnessError` carries
 * a translated message and the tab shows it instead of an empty table.
 *
 * State + fetch only; the row shaping lives in `./admin-harness-rows` so the
 * template binds pre-formatted values and markup does no formatting.
 */
import {
  harnessFailure,
  JSON_HEADERS,
  loadHarnessDetail,
  log,
  RUNS_URL,
} from "./admin-harness-detail";
import {
  buildGapRows,
  buildModelRows,
  buildRunRows,
  buildRunsQuery,
  buildStatCards,
  type HarnessDetailView,
  type HarnessGapRow,
  type HarnessModelRow,
  type HarnessRunRow,
  type HarnessRunSummary,
  type HarnessStatCard,
  type HarnessStats,
} from "./admin-harness-rows";
import { HarnessRunsResponse, HarnessStatsSchema, } from "./admin-harness-schema";
import { t, } from "./i18n";
import { parseOr, } from "./validation";

const STATS_URL = "/api/v1/harness/stats";
/** Page size requested from `/runs`; the endpoint applies its own cap. */
const RUNS_LIMIT = 50;

const EMPTY_STATS: HarnessStats = {
  totals: { runs: 0, failures: 0, costUsd: 0, tokensIn: 0, tokensOut: 0, avgMs: 0, },
  byModel: [],
  byTaskType: [],
  byPattern: [],
  toolingGaps: [],
};

export const adminHarness = {
  harnessRunRows: [] as HarnessRunRow[],
  harnessStatCards: [] as HarnessStatCard[],
  harnessModelRows: [] as HarnessModelRow[],
  harnessGapRows: [] as HarnessGapRow[],
  harnessDetail: null as HarnessDetailView | null,
  harnessRunId: "",
  harnessTaskType: "",
  harnessResult: "",
  harnessSearch: "",
  loadingHarness: false,
  loadingHarnessDetail: false,
  harnessError: "",

  /**
   * Load the runs list and the stats rollup together. Each response is
   * classified independently, so a 403 on stats does not blank the run table.
   * @returns {Promise<void>}
   */
  async loadHarness() {
    this.loadingHarness = true;
    this.harnessError = "";
    try {
      const query = buildRunsQuery(this.harnessTaskType, this.harnessResult, RUNS_LIMIT,);
      const [runsRes, statsRes,] = await Promise.allSettled([
        apiFetch(`${RUNS_URL}${query}`, JSON_HEADERS,),
        apiFetch(STATS_URL, JSON_HEADERS,),
      ],);

      if (runsRes.status === "fulfilled") { await this.applyRuns(runsRes.value,); }
      if (statsRes.status === "fulfilled") { await this.applyStats(statsRes.value,); }
      if (runsRes.status === "rejected" || statsRes.status === "rejected") {
        log.warn("Harness request failed",);
        this.harnessError = t("harness.errorNetwork",);
      }
    } finally {
      this.loadingHarness = false;
    }
  },

  /**
   * Decode the runs envelope into the table model.
   * @param res - Response from `/api/v1/harness/runs`
   * @returns {Promise<void>}
   */
  async applyRuns(res: Response,) {
    const failure = await harnessFailure(res, "harness.errorLoadRuns",);
    if (failure !== null) {
      this.harnessRunRows = [];
      this.harnessError = failure;
      return;
    }

    const data = parseOr(HarnessRunsResponse, await res.json(), { items: [] as HarnessRunSummary[], }, () => {
      showToast("error", t("harness.errorShape",),);
    },);

    this.harnessRunRows = buildRunRows(data.items,);
  },

  /**
   * Decode the stats rollup and rebuild the cards + rollup tables.
   * @param res - Response from `/api/v1/harness/stats`
   * @returns {Promise<void>}
   */
  async applyStats(res: Response,) {
    const failure = await harnessFailure(res, "harness.errorLoadStats",);
    if (failure !== null) {
      this.harnessError = failure;
      return;
    }

    const data = parseOr(HarnessStatsSchema, await res.json(), EMPTY_STATS, () => {
      showToast("error", t("harness.errorShape",),);
    },);

    this.harnessStatCards = buildStatCards(data,);
    this.harnessModelRows = buildModelRows(data.byModel,);
    this.harnessGapRows = buildGapRows(data.toolingGaps,);
  },

  /**
   * Rows after the client-side search. Matches task, type, model, result,
   * branch and sha — the fields an operator would type to find a run.
   *
   * Methods, not getters: `admin.ts` spreads this object into the Alpine
   * page, and spread evaluates a getter once and copies the value, which
   * would freeze the filter result at registration time.
   * @returns {HarnessRunRow[]} the rows the table renders
   */
  filteredHarnessRuns(): HarnessRunRow[] {
    const query = this.harnessSearch.trim().toLowerCase();
    if (!query) { return this.harnessRunRows; }
    const out: HarnessRunRow[] = [];
    for (const row of this.harnessRunRows) {
      const haystack = `${row.task} ${row.taskType} ${row.model} ${row.result} ${row.branch} ${row.gitSha}`
        .toLowerCase();

      if (haystack.includes(query,)) { out.push(row,); }
    }

    return out;
  },

  /**
   * Whether the runs table should render its empty state.
   * @returns {boolean} true when loaded, error-free, and no rows match
   */
  harnessRunsEmpty(): boolean {
    return !this.loadingHarness && this.harnessError === "" && this.filteredHarnessRuns().length === 0;
  },

  /**
   * Whether the model rollup should render its empty state.
   * @returns {boolean} true when the rollup has no model rows
   */
  harnessModelsEmpty(): boolean {
    return this.harnessModelRows.length === 0;
  },

  /**
   * Whether the tooling-gap list should render its empty state.
   * @returns {boolean} true when the rollup has no tooling gaps
   */
  harnessGapsEmpty(): boolean {
    return this.harnessGapRows.length === 0;
  },

  /** @returns {void} re-run the list with the current filter values */
  searchHarness() {
    this.loadHarness();
  },

  /** @returns {void} reset every filter and reload */
  clearHarnessFilters() {
    this.harnessSearch = "";
    this.harnessTaskType = "";
    this.harnessResult = "";
    this.loadHarness();
  },

  /**
   * Fetch one run's full record for the activity/detail view. The fetch and
   * its staleness guard live in `./admin-harness-detail`; this only forwards.
   * @param {string} runId - Run id from the table row
   * @returns {Promise<void>}
   */
  async openHarnessRun(runId: string,) {
    await loadHarnessDetail(this, runId,);
  },

  /**
   * Close the detail view.
   * @returns {void}
   */
  closeHarnessRun() {
    this.harnessRunId = "";
    this.harnessDetail = null;
  },
};
