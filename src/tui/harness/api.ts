// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Static, } from "@sinclair/typebox";
import type {
  HarnessPendingPermission,
  HarnessPermissionDecisionResponse,
  HarnessPermissionsView,
} from "../../frontend/alpine/admin-harness-schema";
import { jsonParseOr, safeFetch as _realFetch, } from "../../utils";
import { API_BASE, } from "../chat";
import type { HarnessRunDetail, HarnessRunSummary, HarnessStats, } from "./types";

export { API_BASE, } from "../chat";

/**
 * The permission wire shapes are derived from the server's schemas (the same
 * module the routes and the web surface use), so the TUI cannot drift from
 * the API: no field name is restated here.
 */
export type PendingPermission = HarnessPendingPermission;
export type PendingPermissionsResponse = HarnessPermissionsView;
export type PermissionDecisionResponse = Static<typeof HarnessPermissionDecisionResponse>;

/** The two decisions the queue accepts (one-shot allow / one-shot reject). */
export type PermissionDecision = "approve" | "deny";

/**
 * Discriminated result for harness API calls. Named `HarnessFetchResult` so it
 * does not collide with the server's run-result union re-exported by ./types.
 */
export type HarnessFetchResult<T,> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };
let _fetch = _realFetch;

export function setFetch(fn: typeof _realFetch,): void {
  _fetch = fn;
}

function buildResult<T,>(result: { ok: boolean; data?: T; error?: Error; status?: number },): HarnessFetchResult<T> {
  if (!result.ok) {
    if (result.status === 403) {
      return { ok: false, error: "admin only", status: 403, };
    }

    // The harness runtime may not be composed at all (ACP integration
    // disabled); say so instead of leaking a bare status code.
    if (result.status === 503) {
      return { ok: false, error: "harness runtime not composed", status: 503, };
    }

    // The server's message says WHY (the ask is gone, the harness refused the
    // decision); the status is the fallback when there is none.
    return {
      ok: false,
      error: result.error?.message ?? `HTTP ${result.status}`,
      status: result.status,
    };
  }

  return { ok: true, data: result.data as T, };
}

async function doFetch<T,>(
  url: string,
  sessionToken: string | undefined,
): Promise<HarnessFetchResult<T>> {
  const result = await _fetch<T>(url, {
    method: "GET",
    auth: sessionToken ? { sessionToken, } : undefined,
    handle401: false,
  },);

  return buildResult(result,);
}

/**
 * Load recent harness runs.
 * @param limit - max number of runs to return
 * @param sessionToken - admin session token
 * @returns the fetch result carrying up to `limit` run summaries
 */
export async function loadRuns(
  limit: number,
  sessionToken: string | undefined,
): Promise<HarnessFetchResult<{ items: HarnessRunSummary[] }>> {
  const url = `${API_BASE}/api/v1/harness/runs?limit=${encodeURIComponent(String(limit,),)}`;
  return doFetch(url, sessionToken,);
}

/**
 * Load full detail for a single run.
 * @param runId
 * @param sessionToken - admin session token
 * @returns the fetch result carrying that run's full detail
 */
export async function loadRunDetail(
  runId: string,
  sessionToken: string | undefined,
): Promise<HarnessFetchResult<HarnessRunDetail>> {
  const url = `${API_BASE}/api/v1/harness/runs/${encodeURIComponent(runId,)}`;
  return doFetch(url, sessionToken,);
}

/**
 * Load harness stats summary.
 * @param sessionToken - admin session token
 * @returns the fetch result carrying the aggregate stats summary
 */
export async function loadStats(
  sessionToken: string | undefined,
): Promise<HarnessFetchResult<HarnessStats>> {
  const url = `${API_BASE}/api/v1/harness/stats`;
  return doFetch(url, sessionToken,);
}

/**
 * Load the pending permission queue (oldest ask first).
 * @param sessionToken - admin session token
 * @returns the fetch result carrying the parked asks
 */
export async function loadPendingPermissions(
  sessionToken: string | undefined,
): Promise<HarnessFetchResult<PendingPermissionsResponse>> {
  const url = `${API_BASE}/api/v1/harness/permissions`;
  return doFetch(url, sessionToken,);
}

/**
 * Decide one parked permission ask.
 *
 * The decision POST reads the error body itself: `safeFetch` drops the body of
 * a non-2xx response, and the server's message is what tells the operator
 * whether the ask is gone or the harness refused the decision — the same
 * reason `chat-create-api.ts` posts with a raw fetch.
 * @param id - the queue-assigned ask id
 * @param decision - `approve` (allow_once) or `deny` (reject_once)
 * @param sessionToken - admin session token
 * @returns the fetch result carrying the decision acknowledgement
 */
export async function decidePermission(
  id: string,
  decision: PermissionDecision,
  sessionToken: string | undefined,
): Promise<HarnessFetchResult<PermissionDecisionResponse>> {
  const url = `${API_BASE}/api/v1/harness/permissions/${encodeURIComponent(id,)}/${decision}`;
  return buildResult(await postDecision(url, sessionToken,),);
}

/**
 * Post the decision and keep the server's message.
 * @param url - the decision endpoint
 * @param sessionToken - admin session token
 * @returns the raw fetch result: the body on success, the message on failure
 */
async function postDecision(
  url: string,
  sessionToken: string | undefined,
): Promise<{ ok: boolean; data?: PermissionDecisionResponse; error?: Error; status?: number }> {
  let response: Response;
  let text: string;
  try {
    // eslint-disable-next-line no-restricted-syntax -- raw Response: safeFetch drops the error body for non-2xx.
    response = await fetch(url, {
      method: "POST",
      headers: sessionToken ? { Authorization: `Bearer ${sessionToken}`, } : {},
      signal: AbortSignal.timeout(30000,),
    },);

    text = await response.text();
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error,),), };
  }

  if (!response.ok) {
    // The error body carries the server's message (src/routes/http-utils/errors.ts:57).
    const message = jsonParseOr<{ error?: string }>(text, {},).error;
    return { ok: false, error: new Error(message ?? `HTTP ${response.status}`,), status: response.status, };
  }

  return { ok: true, data: jsonParseOr<PermissionDecisionResponse>(text, { ok: true, },), status: response.status, };
}
