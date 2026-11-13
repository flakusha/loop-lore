// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Relationships panel API fetchers.
 *
 * Backs the world-edit NPC "Relationships" sub-panel with the shipped
 * relationship backend (character-relationships routes):
 * - GET /api/v1/actors               — cast list (own + public actors)
 * - GET /api/v1/actors/:actorId/relationships — real relationship rows
 *
 * Fetchers follow the npc-state-api pattern: `null` on failure, so the
 * panel can render an error state without throwing.
 * @module frontend/alpine/npc-relationships-api
 */

import type { ActorRelationshipRow, ActorSummary, } from "./chat-types/npc";
import { apiFetch, } from "./htmx";

/** Page size for the cast list — one page covers a typical world cast. */
const CAST_PAGE_SIZE = 200;

/**
 * Fetch the cast list (id + display name per actor).
 * @returns {Promise<ActorSummary[] | null>} actors, or null on failure
 */
export async function fetchRelationshipCast(): Promise<ActorSummary[] | null> {
  try {
    const res = await apiFetch(`/api/v1/actors?pageSize=${CAST_PAGE_SIZE}`,);
    if (!res.ok) { return null; }
    const body = await res.json() as { data?: ActorSummary[] };
    return Array.isArray(body.data,) ? body.data : null;
  } catch {
    return null;
  }
}

/**
 * Fetch one actor's relationships, optionally narrowed to a world.
 * @param actorId
 * @param worldId when omitted the backend returns global (null-world) rows only
 * @returns {Promise<ActorRelationshipRow[] | null>} rows, or null on failure
 */
export async function fetchActorRelationships(
  actorId: string,
  worldId?: string,
): Promise<ActorRelationshipRow[] | null> {
  const query = worldId ? `?worldId=${encodeURIComponent(worldId,)}` : "";
  try {
    const res = await apiFetch(
      `/api/v1/actors/${encodeURIComponent(actorId,)}/relationships${query}`,
    );

    if (!res.ok) { return null; }
    const body = await res.json() as ActorRelationshipRow[];
    return Array.isArray(body,) ? body : null;
  } catch {
    return null;
  }
}
