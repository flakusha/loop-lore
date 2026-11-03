// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World-states API fetchers (GET/POST /api/v1/worlds/:worldId/states).
 *
 * Best-effort like the rest of the story-state read model: non-ok responses
 * and network errors degrade to empty results / `null` instead of throwing,
 * so the GM panel keeps its previous content on a failed refresh.
 */

import { apiFetch, } from "../htmx";
import { jsonBody, } from "../json";
import type { WorldStateCreateInput, WorldStateSnapshot, } from "./types";

/**
 * Fetch one page of world-state snapshots (plus the reported total) for a world.
 * @param worldId
 * @param page
 * @param pageSize
 * @returns {Promise<{ data: WorldStateSnapshot[]; total: number; }>} empty/0 on any failure
 */
export async function fetchWorldStates(
  worldId: string,
  page = 1,
  pageSize = 20,
): Promise<{ data: WorldStateSnapshot[]; total: number }> {
  try {
    const res = await apiFetch(
      `/api/v1/worlds/${worldId}/states?page=${page}&pageSize=${pageSize}`,
    );

    if (!res.ok) { return { data: [], total: 0, }; }
    const body = await res.json() as { data?: WorldStateSnapshot[]; total?: number };
    return { data: body.data ?? [], total: body.total ?? 0, };
  } catch {
    return { data: [], total: 0, };
  }
}

/**
 * Create a world-state snapshot.
 * @param worldId
 * @param input
 * @returns {Promise<string | null>} the new snapshot id, null on failure
 */
export async function createWorldState(
  worldId: string,
  input: WorldStateCreateInput,
): Promise<string | null> {
  try {
    const res = await apiFetch(`/api/v1/worlds/${worldId}/states`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: jsonBody(input,),
    },);

    if (!res.ok) { return null; }
    const body = await res.json() as { id?: string };
    return body.id ?? null;
  } catch {
    return null;
  }
}
