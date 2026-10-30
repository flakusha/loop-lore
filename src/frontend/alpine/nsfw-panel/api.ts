// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── NSFW Panel — read-only API helpers ──────────────────────
import { apiFetch, } from "../htmx";

/**
 * Outcome of a read-only NSFW fetch.
 *
 * - `ok` — the request succeeded and carries the payload.
 * - `denied` — the backend refused access (403). The viewer does not own
 *   the actor, so the panel stays hidden rather than showing an error.
 * - `failed` — any other non-2xx status or a thrown fetch. The affected
 *   section renders as empty; the panel never surfaces an error.
 */
export type NsfwFetchResult<T,> =
  | { status: "ok"; data: T }
  | { status: "denied" }
  | { status: "failed" };

/** Raw intimacy pair row as returned by GET /api/v1/nsfw/intimacy/:actorId. */
export interface NsfwIntimacyPairRow {
  actorId?: string;
  targetActorId?: string;
  score?: number;
  unlockedThresholds?: number[];
}

/** Raw body profile row as returned by GET /api/v1/nsfw/body/:actorId. */
export interface NsfwBodyProfileRow {
  stamina?: number;
  flexibility?: number;
  sensitivity?: number;
  endurance?: number;
  sizeCategory?: string;
  build?: string;
}

/**
 * Classify a response into the panel's outcome vocabulary.
 * @param res - the fetch response
 * @returns {Promise<NsfwFetchResult<T>>}
 */
async function toResult<T,>(res: Response,): Promise<NsfwFetchResult<T>> {
  if (res.status === 403) { return { status: "denied", }; }
  if (!res.ok) { return { status: "failed", }; }
  try {
    return { status: "ok", data: await res.json(), };
  } catch {
    return { status: "failed", };
  }
}

/**
 * Fetch every intimacy pair the actor owns.
 *
 * Uses the LIST endpoint (`/nsfw/intimacy/:actorId`) on purpose: it is a
 * pure SELECT, while the pair endpoint (`/nsfw/intimacy/:actorId/:targetId`)
 * INSERTS a zero-score row on read. The list is directional — it returns
 * pairs whose `actor_id` is the requested actor — so the panel renders what
 * the backend returns and hides itself when the list is empty.
 * @param actorId - the chat character's actor id
 * @returns {Promise<NsfwFetchResult<NsfwIntimacyPairRow[]>>}
 */
export async function fetchIntimacyPairs(
  actorId: string,
): Promise<NsfwFetchResult<NsfwIntimacyPairRow[]>> {
  try {
    const res = await apiFetch(`/api/v1/nsfw/intimacy/${actorId}`,);
    const result = await toResult<NsfwIntimacyPairRow[]>(res,);
    if (result.status !== "ok") { return result; }
    return { status: "ok", data: Array.isArray(result.data,) ? result.data : [], };
  } catch {
    return { status: "failed", };
  }
}

/**
 * Fetch the actor's body profile.
 * @param actorId - the chat character's actor id
 * @returns {Promise<NsfwFetchResult<NsfwBodyProfileRow>>}
 */
export async function fetchBodyProfile(
  actorId: string,
): Promise<NsfwFetchResult<NsfwBodyProfileRow>> {
  try {
    const res = await apiFetch(`/api/v1/nsfw/body/${actorId}`,);
    return await toResult<NsfwBodyProfileRow>(res,);
  } catch {
    return { status: "failed", };
  }
}
