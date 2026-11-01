// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Body State — read-only API helpers ──────────────────────
import { apiFetch, } from "../htmx";
import { jsonParseOr, } from "../json";
import { type NsfwFetchResult, toResult, } from "../nsfw-panel/api";

/** Raw RPG stats row as returned by GET /api/v1/rpg/stats/:actorId (subset). */
export interface RpgStatsRow {
  hp?: number;
  maxHp?: number;
  /** JSON string: [{ name, source?, duration_rounds? }, ...]. */
  conditions?: string;
}

/** Raw arousal row as returned by GET /api/v1/nsfw/arousal/:actorId (subset). */
export interface ArousalRow {
  level?: number;
}

/** One entry of the rpg stats `conditions` JSON string. */
export interface RawCondition {
  name?: string;
  source?: string;
  duration_rounds?: number;
}

/**
 * Fetch the actor's RPG stat block (HP pair + conditions JSON).
 *
 * A 404 (no stats row yet) reports as `failed`, which leaves the health and
 * condition sections empty — the same "render nothing" contract the status
 * panel applies to non-403 failures.
 * @param actorId - the chat character's actor id
 * @returns {Promise<NsfwFetchResult<RpgStatsRow>>}
 */
export async function fetchRpgStats(
  actorId: string,
): Promise<NsfwFetchResult<RpgStatsRow>> {
  try {
    const res = await apiFetch(`/api/v1/rpg/stats/${actorId}`,);
    return await toResult<RpgStatsRow>(res,);
  } catch {
    return { status: "failed", };
  }
}

/**
 * Fetch the actor's NSFW arousal state for a world.
 *
 * Owner- and consent-gated server-side: a 403 reports as `denied` and the
 * caller drops the arousal row instead of erroring. Like the status panel's
 * body-profile read, the GET may insert a default row when absent — but only
 * after the ownership check, and only for a character the viewer owns.
 * @param actorId - the chat character's actor id
 * @param worldId - the chat's world id, when the chat belongs to a world
 * @returns {Promise<NsfwFetchResult<ArousalRow>>}
 */
export async function fetchArousalState(
  actorId: string,
  worldId?: string | null,
): Promise<NsfwFetchResult<ArousalRow>> {
  try {
    // Literal `?` keeps the path template single-interpolation (fe-be harmony
    // normalizes each `${}` into its own path segment); an empty query is
    // equivalent to no query string for the backend.
    const query = worldId ? `worldId=${encodeURIComponent(worldId,)}` : "";
    const res = await apiFetch(`/api/v1/nsfw/arousal/${actorId}?${query}`,);
    return await toResult<ArousalRow>(res,);
  } catch {
    return { status: "failed", };
  }
}

/**
 * Parse the rpg stats `conditions` JSON string into condition view rows.
 *
 * Malformed entries are skipped rather than throwing — a corrupt conditions
 * payload must never break the whole widget. Entries without a usable name
 * are dropped; `duration_rounds` falls through as null when absent.
 * @param raw - the raw JSON string (may be empty or invalid)
 * @returns {RawCondition[]} the parsed condition rows
 */
export function parseConditionsJson(raw: unknown,): RawCondition[] {
  if (typeof raw !== "string" || raw.length === 0 || raw === "[]") { return []; }
  const parsed = jsonParseOr<unknown>(raw, null,);
  if (!Array.isArray(parsed,)) { return []; }
  return parsed.filter(
    (entry,): entry is RawCondition =>
      typeof entry === "object" && entry !== null && typeof (entry as RawCondition).name === "string",
  );
}
