// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NPC-state API fetchers (GET/PUT /api/v1/worlds/:worldId/npc-states/:actorId).
 *
 * PUT returns the written row wrapped in `{ data }` (SuccessResponse); the
 * caller uses it to confirm (or correct) the optimistic update.
 */

import { apiFetch, } from "../htmx";
import { jsonBody, } from "../json";
import type { NpcStatePatch, NpcStateRow, } from "./types";

/**
 * Fetch one NPC's story state.
 * @param worldId
 * @param actorId
 * @returns {Promise<NpcStateRow | null>} null on failure or missing state
 */
export async function fetchNpcState(
  worldId: string,
  actorId: string,
): Promise<NpcStateRow | null> {
  try {
    const res = await apiFetch(`/api/v1/worlds/${worldId}/npc-states/${actorId}`,);
    if (!res.ok) { return null; }
    return await res.json() as NpcStateRow;
  } catch {
    return null;
  }
}

/**
 * PUT NPC-state updates; returns the written row on success.
 * @param worldId
 * @param actorId
 * @param patch at least one field (backend schema requires minProperties: 1)
 * @returns {Promise<NpcStateRow | null>} written row, null on failure
 */
export async function putNpcState(
  worldId: string,
  actorId: string,
  patch: NpcStatePatch,
): Promise<NpcStateRow | null> {
  try {
    const res = await apiFetch(`/api/v1/worlds/${worldId}/npc-states/${actorId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", },
      body: jsonBody(patch,),
    },);

    if (!res.ok) { return null; }
    const body = await res.json() as { data?: NpcStateRow };
    return body.data ?? null;
  } catch {
    return null;
  }
}
