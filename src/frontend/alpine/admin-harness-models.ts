// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Discovered models for the Harness tab (`GET /api/v1/harness/models`).
 *
 * The endpoint already shipped (admin-gated, merging a live harness's model
 * listing with the static capability table) but nothing called it, so the tab
 * showed only the RUN rollup and an operator could not tell which model a
 * profile would actually use.
 *
 * This module owns the fetch, the section's own error channel and the
 * pre-formatted rows. The models request settles with the tab's other
 * requests, but its failure NEVER lands in the tab-level `harnessError`:
 * that banner hides the whole tab content, so a refused models call would
 * blank the runs table and the stat cards with it. A refusal shows its
 * message in this section instead — never an empty list that reads like
 * "nothing was discovered".
 */
import { harnessFailure, harnessThrownMessage, JSON_HEADERS, log, } from "./admin-harness-detail";
import { buildDiscoveredModelRows, type HarnessDiscoveredModelRow, } from "./admin-harness-rows";
import { type HarnessDiscoveredModel, HarnessModelsResponse, } from "./admin-harness-schema";
import { t, } from "./i18n";
import { parseOr, } from "./validation";

/** `GET /api/v1/harness/models` — the discovered-model listing. */
export const MODELS_URL = "/api/v1/harness/models";

/** The slice of tab state this module owns. */
export interface HarnessModelsState {
  /** The discovered models, pre-formatted for the table. */
  harnessDiscoveredModels: HarnessDiscoveredModelRow[];
  /** True while the models request is in flight. */
  loadingHarnessModels: boolean;
  /**
   * Set when the models request was refused or failed. The section shows it
   * instead of the table, so a failure never reads as "no models found".
   */
  harnessModelsError: string;
}

/**
 * The Alpine-facing slice: the tab's state plus the loader the panel binds.
 * Spread into `adminHarness` (like the other harness slices) so the markup's
 * bindings resolve on the component.
 */
export const harnessModels = {
  harnessDiscoveredModels: [] as HarnessDiscoveredModelRow[],
  loadingHarnessModels: false,
  harnessModelsError: "",

  /**
   * Load the discovered models into the tab state.
   * @param res - an already-fetched response; omitted when the slice fetches for itself
   * @returns {Promise<void>}
   */
  async loadHarnessModels(this: HarnessModelsState, res?: Response,): Promise<void> {
    await loadHarnessModels(this, res,);
  },

  /**
   * Whether the discovered-models table should render its empty state.
   * @returns {boolean} true when no model was discovered
   */
  harnessDiscoveredModelsEmpty(this: HarnessModelsState,): boolean {
    return this.harnessDiscoveredModels.length === 0;
  },
};

/**
 * Fetch (or adopt) the models response and shape it into the table rows.
 *
 * @param state - Live tab state (mutated in place)
 * @param res - an already-fetched response; omitted when the slice fetches for itself
 * @returns {Promise<void>}
 */
export async function loadHarnessModels(state: HarnessModelsState, res?: Response,): Promise<void> {
  state.loadingHarnessModels = true;
  state.harnessModelsError = "";
  try {
    const response = res ?? await apiFetch(MODELS_URL, JSON_HEADERS,);
    const failure = await harnessFailure(response, "harness.errorLoadModels",);
    if (failure !== null) {
      state.harnessDiscoveredModels = [];
      state.harnessModelsError = failure;
      return;
    }

    const body = await response.json().catch(() => null);
    const data = parseOr(HarnessModelsResponse, body, { items: [] as HarnessDiscoveredModel[], }, () => {
      showToast("error", t("harness.errorShape",),);
    },);

    state.harnessDiscoveredModels = buildDiscoveredModelRows(data.items,);
  } catch (error) {
    log.warn("Harness discovered models request failed", { error: String(error,), },);
    state.harnessDiscoveredModels = [];
    state.harnessModelsError = harnessThrownMessage(error, "harness.errorLoadModels",);
  } finally {
    state.loadingHarnessModels = false;
  }
}
