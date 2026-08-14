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

/** Fetch the chat detail row for a story chat. */
export async function fetchChatDetail(chatId: string,): Promise<StoryChatDetail | null> {
  const res = await apiFetch(`/api/v1/chats/${chatId}`, { headers: { Accept: "application/json", }, },);
  if (!res.ok) { return null; }
  return await res.json() as StoryChatDetail;
}

/** Fetch the world's display name (best-effort). */
export async function fetchWorldName(worldId: string,): Promise<string | null> {
  try {
    const res = await apiFetch(`/api/worlds/${worldId}`,);
    if (!res.ok) { return null; }
    const world = await res.json() as { name?: string };
    return world.name ?? null;
  } catch (error) {
    log.warn("World name load failed", { worldId, error, },);
    return null;
  }
}

/** Fetch the latest story turns for a chat. */
export async function fetchStoryTurns(chatId: string,): Promise<StoryTurnRow[]> {
  const res = await apiFetch(`/api/chats/${chatId}/story-turns?pageSize=50`,);
  if (!res.ok) { return []; }
  const data = await res.json() as { data?: StoryTurnRow[] };
  return data.data ?? [];
}

/** Fetch world quest rows. */
export async function fetchQuests(worldId: string,): Promise<StoryQuest[]> {
  const res = await apiFetch(`/api/worlds/${worldId}/quests?pageSize=100`,);
  if (!res.ok) { return []; }
  const data = await res.json() as { data?: StoryQuest[] };
  return data.data ?? [];
}

/** Location story-state (time/weather/atmosphere/description), best-effort. */
export interface LocationState {
  timeOfDay: string | null;
  weather: string | null;
  atmosphere: string | null;
  description: string | null;
}

/** Fetch a location's story state, tolerating response shape drift. */
export async function fetchLocationState(locationId: string,): Promise<LocationState | null> {
  try {
    const res = await apiFetch(`/api/locations/${locationId}/state`,);
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

/** Fetch NPCs present at a location within a world. */
export async function fetchNpcsAt(
  worldId: string,
  locationId: string,
): Promise<{ actorId: string; displayName: string }[] | null> {
  try {
    const res = await apiFetch(`/api/worlds/${worldId}/npcs-at/${locationId}`,);
    if (!res.ok) { return null; }
    return await res.json() as { actorId: string; displayName: string }[];
  } catch (error) {
    log.warn("NPC-at-location load failed", { worldId, locationId, error, },);
    return null;
  }
}

/** Fetch chat participants for turn-order display. */
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
