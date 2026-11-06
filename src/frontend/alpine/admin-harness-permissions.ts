// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pending permission asks for the Harness tab — the caller half of the ACP
 * approval flow (TASK-harness-approval-flow-operability).
 *
 * The server side already ships: `GET /api/v1/harness/permissions` lists the
 * asks parked for a human, `POST /:id/approve` and `POST /:id/deny` resolve
 * them. Without a caller a parked ask could only be answered with curl, and the
 * queue never times out — so the harness session waited forever with no signal.
 *
 * This module owns the fetch, the row shaping and the decision call. Approve
 * sends `allow_once` and deny sends `reject_once`; there is no grant
 * persistence, so nothing is remembered beyond the single decision.
 */
import { toDate, } from "../../utils/date";
import { harnessFailure, harnessThrownMessage, JSON_HEADERS, log, } from "./admin-harness-detail";
import { formatRunTs, textOrDash, } from "./admin-harness-format";
import {
  type HarnessPendingPermission,
  HarnessPermissionsResponse,
} from "./admin-harness-schema";
import { t, } from "./i18n";
import { safeJsonStringify, } from "./json";
import { parseOr, } from "./validation";

/** `GET /api/v1/harness/permissions` — also the prefix for `/:id/approve|deny`. */
export const PERMISSIONS_URL = "/api/v1/harness/permissions";

/** The two decisions the queue accepts; each applies to a single ask. */
export type HarnessPermissionDecision = "approve" | "deny";

/** One parked ask, shaped for the table (pre-formatted, so markup formats nothing). */
export interface HarnessPermissionRow {
  id: string;
  profile: string;
  tool: string;
  cwd: string;
  /** Compact, single-line preview of the harness's raw request input. */
  input: string;
  /** Arrival time, localized. */
  arrived: string;
}

/** The slice of tab state this module owns. */
export interface HarnessPermissionsState {
  harnessPermissionRows: HarnessPermissionRow[];
  /**
   * Set when the queue could not be READ. The rows are cleared with it, so the
   * panel replaces the table with the error — a failed read leaves nothing to
   * decide on.
   */
  harnessPermissionsError: string;
  /**
   * Set when a DECISION failed. The queue is still readable, so the parked
   * asks stay listed: the operator has to see them to retry. Kept apart from
   * `harnessPermissionsError` so a failed decision never hides the queue.
   */
  harnessDecisionError: string;
  /** Id of the ask being decided; the panel disables the buttons while one is in flight. */
  harnessDecidingId: string;
}

/**
 * The Alpine-facing slice: the tab's state plus the two actions the panel
 * binds. Spread into `adminHarness` (like the other harness slices) so the
 * markup's `@click` handlers resolve on the component.
 */
export const harnessPermissions = {
  harnessPermissionRows: [] as HarnessPermissionRow[],
  harnessPermissionsError: "",
  harnessDecisionError: "",
  harnessDecidingId: "",

  /**
   * Load the parked permission asks (the approval queue the tab serves).
   * @returns {Promise<void>}
   */
  async refreshHarnessPermissions(this: HarnessPermissionsState,): Promise<void> {
    await loadHarnessPermissions(this,);
  },

  /**
   * Approve or deny one parked ask; the list reloads afterwards.
   * @param {string} id - the parked ask's id
   * @param {"approve"|"deny"} decision - approve or deny the ask
   * @returns {Promise<void>}
   */
  async answerHarnessPermission(
    this: HarnessPermissionsState,
    id: string,
    decision: HarnessPermissionDecision,
  ): Promise<void> {
    await decideHarnessPermission(this, id, decision,);
  },
};

/** Longest raw-input preview kept in one table cell. */
const MAX_INPUT_PREVIEW = 160;

/**
 * Compact one-line preview of the raw ACP request params.
 *
 * Both payload shapes go through the same cap: a harness may send the params
 * as a bare string, and an uncapped string would stretch the table row. The
 * whitespace flattening matches the pi-tui preview (`formatPermissionInput`),
 * so the same ask reads the same on both surfaces.
 * @param input - the harness's raw `session/request_permission` params
 * @returns a single-line, length-capped summary
 */
function previewInput(input: unknown,): string {
  if (input === null || input === undefined) { return textOrDash(null,); }

  const serialized = typeof input === "string" ? { ok: true as const, value: input, } : safeJsonStringify(input,);
  const text = serialized.ok ? serialized.value : String(input,);

  const flat = text.replace(/\s+/g, " ",).trim();
  if (flat.length === 0) { return textOrDash(null,); }

  return flat.length > MAX_INPUT_PREVIEW ? `${flat.slice(0, MAX_INPUT_PREVIEW - 1,)}…` : flat;
}

/**
 * Shape the wire asks into table rows.
 * @param items - the decoded pending asks, oldest first
 * @returns one row per ask
 */
export function buildPermissionRows(items: HarnessPendingPermission[],): HarnessPermissionRow[] {
  return items.map((item,) => ({
    id: item.id,
    profile: item.profile,
    tool: textOrDash(item.tool,),
    cwd: item.cwd,
    input: previewInput(item.input,),
    arrived: formatRunTs(toDate(item.arrival,).toISOString(),),
  }));
}

/**
 * A fresh permissions slice (empty queue, nothing loading, no error).
 * @returns the initial slice state
 */
export function emptyHarnessPermissionsState(): HarnessPermissionsState {
  return {
    harnessPermissionRows: [],
    harnessPermissionsError: "",
    harnessDecisionError: "",
    harnessDecidingId: "",
  };
}

/**
 * Load the pending asks into the tab state.
 * @param state - Live tab state (mutated in place)
 * @returns {Promise<void>}
 */
export async function loadHarnessPermissions(state: HarnessPermissionsState,): Promise<void> {
  state.harnessPermissionsError = "";
  // Fresh data supersedes a stale decision failure.
  state.harnessDecisionError = "";
  try {
    const res = await apiFetch(PERMISSIONS_URL, JSON_HEADERS,);
    const failure = await harnessFailure(res, "harness.permissions.loadFailed",);
    if (failure !== null) {
      state.harnessPermissionRows = [];
      state.harnessPermissionsError = failure;
      return;
    }

    const data = parseOr(
      HarnessPermissionsResponse,
      await res.json(),
      { items: [] as HarnessPendingPermission[], },
      () => {
        showToast("error", t("harness.errorShape",),);
      },
    );

    state.harnessPermissionRows = buildPermissionRows(data.items,);
  } catch (error) {
    log.warn("Harness permissions request failed", { error: String(error,), },);
    state.harnessPermissionRows = [];
    state.harnessPermissionsError = harnessThrownMessage(error, "harness.permissions.loadFailed",);
  }
}

/**
 * Approve or deny one parked ask, then refresh the list.
 *
 * The decision applies to that single ask (`allow_once` / `reject_once`); the
 * queue keeps no grant, so nothing else changes about the profile.
 * @param state - Live tab state (mutated in place)
 * @param id - the parked ask's id
 * @param decision - approve or deny
 * @returns {Promise<void>}
 */
export async function decideHarnessPermission(
  state: HarnessPermissionsState,
  id: string,
  decision: HarnessPermissionDecision,
): Promise<void> {
  if (state.harnessDecidingId !== "") { return; }
  state.harnessDecidingId = id;
  try {
    // The route is POST-only and `apiFetch` defaults to GET, so the method is
    // explicit here — a GET would 404 and the ask would never be decided.
    const res = await apiFetch(`${PERMISSIONS_URL}/${encodeURIComponent(id,)}/${decision}`, {
      ...JSON_HEADERS,
      method: "POST",
    },);

    const failure = await harnessFailure(res, "harness.permissions.decideFailed",);
    if (failure !== null) {
      // The queue is untouched — the ask is still parked. Report the failure
      // in its own field so the table keeps listing the pending asks.
      state.harnessDecisionError = failure;
      return;
    }

    await loadHarnessPermissions(state,);
  } catch (error) {
    log.warn("Harness permission decision failed", { error: String(error,), },);
    state.harnessDecisionError = harnessThrownMessage(error, "harness.permissions.decideFailed",);
  } finally {
    state.harnessDecidingId = "";
  }
}
