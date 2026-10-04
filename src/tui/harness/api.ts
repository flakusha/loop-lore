// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { safeFetch as _realFetch, } from "../../utils";
import { API_BASE, } from "../chat";
import type { HarnessRunDetail, HarnessRunSummary, HarnessStats, } from "./types";

export { API_BASE, } from "../chat";

/**
 * Discriminated result for harness API calls. Named `HarnessFetchResult` so it
 * does not collide with the server's run-result union re-exported by ./types.
 */
export type HarnessFetchResult<T,> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };
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
    return {
      ok: false,
      error: result.status !== undefined ? `HTTP ${result.status}` : result.error!.message,
      status: result.status,
    };
  }
  return { ok: true, data: result.data as T, };
}

async function doFetch<T,>(url: string, sessionToken: string | undefined,): Promise<HarnessFetchResult<T>> {
  const result = await _fetch<T>(url, {
    auth: sessionToken ? { sessionToken, } : undefined,
    handle401: false,
  },);
  return buildResult(result,);
}

/**
 * Load recent harness runs.
 * @param limit - max number of runs to return
 * @param sessionToken - admin session token
 */
export async function loadRuns(
  limit: number,
  sessionToken: string | undefined,
): Promise<HarnessFetchResult<{ items: HarnessRunSummary[] }>> {
  const url = `${API_BASE}/api/v1/harness/runs?limit=${limit}`;
  return doFetch(url, sessionToken,);
}

/**
 * Load full detail for a single run.
 * @param runId
 * @param sessionToken - admin session token
 */
export async function loadRunDetail(
  runId: string,
  sessionToken: string | undefined,
): Promise<HarnessFetchResult<HarnessRunDetail>> {
  const url = `${API_BASE}/api/v1/harness/runs/${runId}`;
  return doFetch(url, sessionToken,);
}

/**
 * Load harness stats summary.
 * @param sessionToken - admin session token
 */
export async function loadStats(
  sessionToken: string | undefined,
): Promise<HarnessFetchResult<HarnessStats>> {
  const url = `${API_BASE}/api/v1/harness/stats`;
  return doFetch(url, sessionToken,);
}
