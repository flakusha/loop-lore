// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pending repo-access escalations for the Harness tab — the operator half of
 * the escalation audit queue (TASK-escalation-audit-queue-with-no-auto-approve).
 *
 * The server side already ships: `GET /api/v1/harness/escalations` lists the
 * recorded root-change requests that wait for an admin decision, and
 * `POST /:id/approve` / `POST /:id/deny` decide them. No principal is ever
 * auto-approved, so a recorded request stays parked until an operator answers
 * it — without this caller the only way to answer was curl.
 *
 * This module owns the fetch, the row shaping and the decision call, and it
 * mirrors the permission queue's mechanics: one decision in flight at a time,
 * a reload after a decision, and a failed decision reported without hiding
 * the queue.
 */
import { type Static, } from "@sinclair/typebox";
import { sqliteUtcToIso, } from "../../utils/date";
import { harnessFailure, harnessThrownMessage, JSON_HEADERS, log, } from "./admin-harness-detail";
import { formatRunTs, textOrDash, } from "./admin-harness-format";
import { HarnessEscalationsResponse, } from "./admin-harness-schema";
import { t, } from "./i18n";
import { parseOr, } from "./validation";

/** `GET /api/v1/harness/escalations` — also the prefix for `/:id/approve|deny`. */
export const ESCALATIONS_URL = "/api/v1/harness/escalations";

/** The two decisions the queue accepts; each applies to a single request. */
export type HarnessEscalationDecision = "approve" | "deny";

/** One recorded request, as the wire sends it. */
type PendingEscalation = Static<typeof HarnessEscalationsResponse>["items"][number];

/** One parked request, shaped for the table (pre-formatted, so markup formats nothing). */
export interface HarnessEscalationRow {
  id: string;
  /** The principal that asked for the root change. */
  subjectId: string;
  /** The kind of principal that asked (user, service, …). */
  kind: string;
  /** The path the request wanted to change. */
  targetPath: string;
  /** Why the request was made — the audit trail's own words. */
  rationale: string;
  /** When the request was recorded, localized. */
  requested: string;
}

/** The slice of tab state this module owns. */
export interface HarnessEscalationsState {
  harnessEscalationRows: HarnessEscalationRow[];
  /**
   * Set when the queue could not be READ. The rows are cleared with it, so the
   * panel replaces the table with the error — a failed read leaves nothing to
   * decide on.
   */
  harnessEscalationsError: string;
  /**
   * Set when the harness runtime is not composed (503): the queue cannot be
   * listed or decided at all. Kept apart from `harnessEscalationsError` so the
   * panel can say so plainly instead of showing an empty queue that looks
   * like "nothing to approve".
   */
  harnessEscalationsUnavailable: string;
  /**
   * Set when a DECISION failed. The queue is still readable, so the parked
   * requests stay listed: the operator has to see them to retry. Kept apart
   * from `harnessEscalationsError` so a failed decision never hides the queue.
   */
  harnessEscalationDecisionError: string;
  /** Id of the request being decided; the panel disables the buttons while one is in flight. */
  harnessEscalationDecidingId: string;
}

/**
 * The Alpine-facing slice: the tab's state plus the two actions the panel
 * binds. Spread into `adminHarness` (like the other harness slices) so the
 * markup's `@click` handlers resolve on the component.
 */
export const harnessEscalations = {
  harnessEscalationRows: [] as HarnessEscalationRow[],
  harnessEscalationsError: "",
  harnessEscalationsUnavailable: "",
  harnessEscalationDecisionError: "",
  harnessEscalationDecidingId: "",

  /**
   * Load the pending escalation requests (the queue the tab serves).
   * @returns {Promise<void>}
   */
  async refreshHarnessEscalations(this: HarnessEscalationsState,): Promise<void> {
    await loadHarnessEscalations(this,);
  },

  /**
   * Approve or deny one pending request; the list reloads afterwards.
   * @param {string} id - the recorded request's id
   * @param {"approve"|"deny"} decision - approve or deny the request
   * @returns {Promise<void>}
   */
  async answerHarnessEscalation(
    this: HarnessEscalationsState,
    id: string,
    decision: HarnessEscalationDecision,
  ): Promise<void> {
    await decideHarnessEscalation(this, id, decision,);
  },
};

/** The status the harness answers with when its runtime is not composed. */
const NOT_COMPOSED_STATUS = 503;

/**
 * The message for a failed escalation request.
 *
 * A 503 means the harness runtime is not composed, so the queue is not merely
 * empty — it cannot be reached. Every other failure keeps the endpoint's own
 * message when the failure carried one: `feFetch` throws on a non-2xx and
 * carries the failed response's body on the error, so a rejected decision
 * reads as the endpoint's wording ("escalation request ... was already
 * decided"), not as a generic message that hides what went wrong.
 * @param error - the error the request threw
 * @param key - i18n key for the endpoint's own failure message
 * @returns the message to show
 */
function escalationThrownMessage(error: unknown, key: string,): string {
  const status = (error as { status?: number } | null)?.status;
  if (status === NOT_COMPOSED_STATUS) { return t("harness.escalations.unavailable",); }
  return harnessThrownMessage(error, key,);
}

/**
 * Shape the wire requests into table rows.
 * @param items - the decoded pending requests, oldest first
 * @returns one row per request
 */
export function buildEscalationRows(items: PendingEscalation[],): HarnessEscalationRow[] {
  return items.map((item,) => {
    // The audit table stores SQLite UTC text; the panel renders a local time.
    const iso = sqliteUtcToIso(item.createdAt,);
    return {
      id: item.id,
      subjectId: textOrDash(item.subjectId,),
      kind: textOrDash(item.kind,),
      targetPath: textOrDash(item.targetPath,),
      rationale: textOrDash(item.rationale,),
      requested: iso === "" ? textOrDash(item.createdAt,) : formatRunTs(iso,),
    };
  },);
}

/**
 * A fresh escalations slice (empty queue, nothing loading, no error).
 * @returns the initial slice state
 */
export function emptyHarnessEscalationsState(): HarnessEscalationsState {
  return {
    harnessEscalationRows: [],
    harnessEscalationsError: "",
    harnessEscalationsUnavailable: "",
    harnessEscalationDecisionError: "",
    harnessEscalationDecidingId: "",
  };
}

/**
 * Load the pending escalation requests into the tab state.
 * @param state - Live tab state (mutated in place)
 * @returns {Promise<void>}
 */
export async function loadHarnessEscalations(state: HarnessEscalationsState,): Promise<void> {
  state.harnessEscalationsError = "";
  state.harnessEscalationsUnavailable = "";
  // Fresh data supersedes a stale decision failure.
  state.harnessEscalationDecisionError = "";
  try {
    const res = await apiFetch(ESCALATIONS_URL, JSON_HEADERS,);
    if (res.status === NOT_COMPOSED_STATUS) {
      // The runtime is not composed: the queue is not empty, it is unreachable.
      state.harnessEscalationRows = [];
      state.harnessEscalationsUnavailable = t("harness.escalations.unavailable",);
      return;
    }

    const failure = await harnessFailure(res, "harness.escalations.loadFailed",);
    if (failure !== null) {
      state.harnessEscalationRows = [];
      state.harnessEscalationsError = failure;
      return;
    }

    const data = parseOr(
      HarnessEscalationsResponse,
      await res.json(),
      { items: [] as PendingEscalation[], },
      () => {
        showToast("error", t("harness.errorShape",),);
      },
    );

    state.harnessEscalationRows = buildEscalationRows(data.items,);
  } catch (error) {
    log.warn("Harness escalations request failed", { error: String(error,), },);
    state.harnessEscalationRows = [];

    if ((error as { status?: number } | null)?.status === NOT_COMPOSED_STATUS) {
      state.harnessEscalationsUnavailable = t("harness.escalations.unavailable",);
      return;
    }

    state.harnessEscalationsError = escalationThrownMessage(error, "harness.escalations.loadFailed",);
  }
}

/**
 * Approve or deny one pending request, then refresh the list.
 *
 * An approval grants ONE later root change for that principal and target; a
 * denial closes the request. Nothing else changes, so the reload only has to
 * drop the decided request from the queue.
 * @param state - Live tab state (mutated in place)
 * @param id - the recorded request's id
 * @param decision - approve or deny
 * @returns {Promise<void>}
 */
export async function decideHarnessEscalation(
  state: HarnessEscalationsState,
  id: string,
  decision: HarnessEscalationDecision,
): Promise<void> {
  if (state.harnessEscalationDecidingId !== "") { return; }
  state.harnessEscalationDecidingId = id;
  try {
    // The route is POST-only and `apiFetch` defaults to GET, so the method is
    // explicit here — a GET would 404 and the request would never be decided.
    const res = await apiFetch(`${ESCALATIONS_URL}/${encodeURIComponent(id,)}/${decision}`, {
      ...JSON_HEADERS,
      method: "POST",
    },);

    const failure = await harnessFailure(res, "harness.escalations.decideFailed",);
    if (failure !== null) {
      // The queue is untouched — the request is still parked. Report the
      // failure in its own field so the table keeps listing the pending
      // requests.
      state.harnessEscalationDecisionError = failure;
      return;
    }

    await loadHarnessEscalations(state,);
  } catch (error) {
    log.warn("Harness escalation decision failed", { error: String(error,), },);
    state.harnessEscalationDecisionError = escalationThrownMessage(error, "harness.escalations.decideFailed",);
  } finally {
    state.harnessEscalationDecidingId = "";
  }
}
