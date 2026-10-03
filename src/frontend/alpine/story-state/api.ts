// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Story-state API fetchers.
 *
 * Best-effort fetchers for the story-mode read model (chat detail, turns,
 * quests, location state, NPCs, participants). Failures log a warning and
 * return a safe default so the component can keep its read-only surfaces
 * populated. Extracted so `story-state.ts` stays under the 250L file-size
 * guard.
 */

import { apiFetch, } from "../htmx";
import { log as rootLog, } from "../logger";
import type { ParticipantRow, } from "./derived";
import type { StoryChatDetail, StoryQuest, StoryTurnRow, } from "./types";

const log = rootLog.child({ module: "story-state-api", },);

/**
 * Fetch the chat detail row for a story chat.
 * @param chatId
 * @returns {Promise<StoryChatDetail | null>}
 */
export async function fetchChatDetail(chatId: string,): Promise<StoryChatDetail | null> {
  const res = await apiFetch(`/api/v1/chats/${chatId}`, { headers: { Accept: "application/json", }, },);
  if (!res.ok) { return null; }
  return await res.json() as StoryChatDetail;
}

/**
 * Fetch the world's display name (best-effort).
 * @param worldId
 * @returns {Promise<string | null>}
 */
export async function fetchWorldName(worldId: string,): Promise<string | null> {
  try {
    const res = await apiFetch(`/api/v1/worlds/${worldId}`,);
    if (!res.ok) { return null; }
    const world = await res.json() as { name?: string };
    return world.name ?? null;
  } catch (error) {
    log.warn("World name load failed", { worldId, error, },);
    return null;
  }
}

/**
 * Fetch the latest story turns for a chat.
 * @param chatId
 * @returns {Promise<StoryTurnRow[]>}
 */
export async function fetchStoryTurns(chatId: string,): Promise<StoryTurnRow[]> {
  const res = await apiFetch(`/api/v1/chats/${chatId}/story-turns?pageSize=50`,);
  if (!res.ok) { return []; }
  const data = await res.json() as { data?: StoryTurnRow[] };
  return data.data ?? [];
}

/** Rows per request when walking the world quest log. */
const QUEST_PAGE_SIZE = 100;

/**
 * Fetch every world quest row, page by page.
 *
 * The quest log is a history view (status pills for completed/failed, "No
 * quests." empty state), and `handleListQuests` defaults to every
 * non-abandoned row ordered by `priority desc`. A single `?pageSize=100`
 * request therefore truncated silently: past 100 quests the active ones could
 * fall off the ordered page and simply be absent, with no error and no empty
 * state. Walking the pages is correct at any quest count.
 * @param worldId
 * @returns {Promise<StoryQuest[]>}
 */
export async function fetchQuests(worldId: string,): Promise<StoryQuest[]> {
  const quests: StoryQuest[] = [];
  for (let page = 1;; page++) {
    const res = await apiFetch(
      `/api/v1/worlds/${worldId}/quests?pageSize=${QUEST_PAGE_SIZE}&page=${page}`,
    );
    // A mid-walk failure keeps what was already collected rather than
    // throwing away a partial log; the next refresh retries from page 1.
    if (!res.ok) { return quests; }
    const body = await res.json() as { data?: StoryQuest[]; pagination?: { total?: number } };
    const rows = body.data ?? [];
    quests.push(...rows,);
    // Two independent stop conditions: a short page means the last page, and
    // `total` bounds the walk so a server that ignores `page` cannot spin.
    if (rows.length < QUEST_PAGE_SIZE) { return quests; }
    if ((body.pagination?.total ?? 0) <= quests.length) { return quests; }
  }
}

/** Location story-state (time/weather/atmosphere/description), best-effort. */
export interface LocationState {
  timeOfDay: string | null;
  weather: string | null;
  atmosphere: string | null;
  description: string | null;
}

/**
 * Fetch a location's story state, tolerating response shape drift.
 * @param locationId
 * @returns {Promise<LocationState | null>}
 */
export async function fetchLocationState(locationId: string,): Promise<LocationState | null> {
  try {
    const res = await apiFetch(`/api/v1/locations/${locationId}/state`,);
    if (!res.ok) { return null; }
    const row = await res.json() as Record<string, unknown>;
    const state = (row.state as Record<string, unknown>) ?? row;
    return {
      timeOfDay: typeof state.time_of_day === "string" ? state.time_of_day : null,
      weather: typeof state.weather === "string" ? state.weather : null,
      atmosphere: typeof state.atmosphere === "string" ? state.atmosphere : null,
      description: typeof state.description_override === "string" ? state.description_override : null,
    };
  } catch (error) {
    log.warn("Location state load failed", { locationId, error, },);
    return null;
  }
}

/**
 * Fetch NPCs present at a location within a world.
 * @param worldId
 * @param locationId
 * @returns {Promise<{ actorId: string; displayName: string; }[] | null>}
 */
export async function fetchNpcsAt(
  worldId: string,
  locationId: string,
): Promise<{ actorId: string; displayName: string }[] | null> {
  try {
    const res = await apiFetch(`/api/v1/worlds/${worldId}/npcs-at/${locationId}`,);
    if (!res.ok) { return null; }
    return await res.json() as { actorId: string; displayName: string }[];
  } catch (error) {
    log.warn("NPC-at-location load failed", { worldId, locationId, error, },);
    return null;
  }
}

/**
 * Fetch chat participants for turn-order display.
 * @param chatId
 * @returns {Promise<ParticipantRow[] | null>}
 */
export async function fetchParticipants(chatId: string,): Promise<ParticipantRow[] | null> {
  try {
    const res = await apiFetch(`/api/v1/chats/${chatId}/participants`,);
    if (!res.ok) { return null; }
    return await res.json() as ParticipantRow[];
  } catch (error) {
    log.warn("Participants load failed", { chatId, error, },);
    return null;
  }
}
