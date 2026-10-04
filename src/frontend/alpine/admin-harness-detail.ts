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
    state.harnessError = t("harness.errorNetwork",);
  } finally {
    if (!isStale(state.harnessRunId, runId,)) { state.loadingHarnessDetail = false; }
  }
}
