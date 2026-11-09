// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Single-run detail fetch for the Harness tab (the activity view).
 *
 * Split out of `admin-harness.ts` to keep that file under the 250L ceiling.
 * The three rollup loaders stay together; this one method is the only caller
 * of the staleness guard, so it owns it.
 *
 * This module is the single home for the harness endpoint constants and the
 * response guard, so the component imports rather than re-declares them.
 */
import { getErrorMessage, } from "../pages/shared";
import { buildDetailView, type HarnessDetailView, isStale, } from "./admin-harness-rows";
import { HarnessRunDetailNullable, } from "./admin-harness-schema";
import { t, } from "./i18n";
import { log as rootLog, } from "./logger";
import { parseOr, } from "./validation";

/** `GET /api/v1/harness/runs` — also the prefix for `/runs/:runId`. */
export const RUNS_URL = "/api/v1/harness/runs";
/** `GET /api/v1/harness/settings` — the admin settings/profiles view. */
export const SETTINGS_URL = "/api/v1/harness/settings";
/** Every harness call asks for JSON. */
export const JSON_HEADERS = { headers: { Accept: "application/json", }, };

/** Tab-scoped logger: every harness line is tagged `admin-harness` in the console. */
export const log = rootLog.child({ module: "admin-harness", },);

/**
 * Classify one harness response into "decode this" or "the tab shows this".
 *
 * All three endpoints are admin-gated, so 403 is a real user-facing state and
 * not an error path. Returns the translated message to display, or `null` when
 * the response is a 2xx the caller should decode.
 *
 * @param res - Fetch response from a harness endpoint
 * @param key - i18n key for the non-403 failure message
 * @returns {Promise<string|null>} the message to show, or null to proceed
 */
export async function harnessFailure(res: Response, key: string,): Promise<string | null> {
  if (res.status === 403) { return t("harness.errorForbidden",); }
  if (!res.ok) { return await getErrorMessage(res, t(key,),); }
  return null;
}

/**
 * Classify a THROWN harness request failure into the message the tab shows.
 *
 * `apiFetch` never surfaces a non-2xx response — `feFetch` throws it — so the
 * HTTP status arrives on the error, not on a Response. Without this every
 * failure reads as "the API is unreachable": a 403 (not an admin) and a 500
 * (the server refused) look identical to a dead server.
 * @param error - the error the request threw
 * @param key - i18n key for the endpoint's own failure message
 * @returns the message to show
 */
export function harnessThrownMessage(error: unknown, key: string,): string {
  const status = (error as { status?: number } | null)?.status;
  if (status === 403) { return t("harness.errorForbidden",); }
  // No status (or a zero one) means the request never got an answer — the
  // server is down.
  if (!status) { return t("harness.errorNetwork",); }
  return t(key,);
}

/**
 * The tab's error channels: the banner and the discovered-models section's own.
 *
 * They are separate because they cover separate sections: the banner hides
 * the whole tab content, so a failed models call must NOT land there — it
 * would blank the runs table and the stat cards with it.
 */
export interface HarnessTabLoadErrors {
  /** The tab-level banner (runs/stats); null when both loaded. */
  tab: string | null;
  /** The discovered-models section's own message; null when it loaded. */
  models: string | null;
}

/**
 * The messages for a failed tab load, or nulls when everything loaded.
 *
 * The runs and stats requests settle together and the tab shows ONE error
 * banner, so the first rejection wins: a runs failure reads as the runs
 * failure, a stats-only failure as the stats failure. The models request
 * keeps its own channel, so its failure never hides the other sections.
 * @param runs - settled result of the runs request
 * @param stats - settled result of the stats request
 * @param models - settled result of the models request
 * @returns the per-section messages, null where the section loaded
 */
export function harnessTabLoadError(
  runs: PromiseSettledResult<Response>,
  stats: PromiseSettledResult<Response>,
  models: PromiseSettledResult<Response>,
): HarnessTabLoadErrors {
  let tab: string | null = null;
  if (runs.status === "rejected") {
    tab = harnessThrownMessage(runs.reason, "harness.errorLoadRuns",);
  } else if (stats.status === "rejected") {
    tab = harnessThrownMessage(stats.reason, "harness.errorLoadStats",);
  }

  let modelsMessage: string | null = null;
  if (models.status === "rejected") {
    modelsMessage = harnessThrownMessage(models.reason, "harness.errorLoadModels",);
  }

  return { tab, models: modelsMessage, };
}

/** The slice of tab state this method touches. */
export interface HarnessDetailState {
  harnessRunId: string;
  harnessDetail: HarnessDetailView | null;
  loadingHarnessDetail: boolean;
  harnessError: string;
}

/**
 * Fetch one run's full record for the activity/detail view.
 *
 * Rapid clicks would otherwise let a slow earlier response overwrite the run
 * the user picked last, so every response is discarded unless the selection
 * still points at the run it was requested for.
 *
 * @param state - Live tab state (mutated in place)
 * @param runId - Run id from the table row
 * @returns {Promise<void>}
 */
export async function loadHarnessDetail(state: HarnessDetailState, runId: string,): Promise<void> {
  state.harnessRunId = runId;
  state.harnessDetail = null;
  state.loadingHarnessDetail = true;
  try {
    const res = await apiFetch(`${RUNS_URL}/${encodeURIComponent(runId,)}`, JSON_HEADERS,);
    if (isStale(state.harnessRunId, runId,)) { return; }
    if (res.status === 403) {
      state.harnessError = t("harness.errorForbidden",);
      return;
    }

    if (!res.ok) {
      state.harnessError = await getErrorMessage(res, t("harness.errorLoadRun",),);
      return;
    }

    const detail = parseOr(HarnessRunDetailNullable, await res.json(), null, () => {
      showToast("error", t("harness.errorShape",),);
    },);

    if (isStale(state.harnessRunId, runId,)) { return; }
    state.harnessDetail = detail === null ? null : buildDetailView(detail,);
  } catch (error) {
    if (isStale(state.harnessRunId, runId,)) { return; }
    log.warn("Harness run detail request failed", { error: String(error,), },);
    state.harnessError = harnessThrownMessage(error, "harness.errorLoadRun",);
  } finally {
    if (!isStale(state.harnessRunId, runId,)) { state.loadingHarnessDetail = false; }
  }
}
