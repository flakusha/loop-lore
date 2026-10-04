// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Mood Panel — standalone async API functions ──
import { apiFetch, } from "../htmx";
import { jsonBody, } from "../json";
import type { EmotionDefinition, EmotionLogEntry, MoodState, } from "./types";

/**
 * @param actorId
 * @returns {Promise<MoodState | null>}
 */
export async function fetchMood(actorId: string,): Promise<MoodState | null> {
  try {
    const res = await apiFetch(`/api/v1/actors/${actorId}/mood`,);
    if (res.ok) { return await res.json(); }
    return null;
  } catch {
    return null;
  }
}

/**
 * @param actorId
 * @returns {Promise<EmotionLogEntry[]>}
 */
export async function fetchEmotions(actorId: string,): Promise<EmotionLogEntry[]> {
  try {
    const res = await apiFetch(`/api/v1/actors/${actorId}/emotions`,);
    if (res.ok) { return await res.json(); }
    return [];
  } catch {
    return [];
  }
}

/**
 * @returns {Promise<EmotionDefinition[]>}
 */
export async function fetchEmotionDefs(): Promise<EmotionDefinition[]> {
  try {
    const res = await apiFetch("/api/v1/emotions",);
    if (res.ok) { return await res.json(); }
    return [];
  } catch {
    return [];
  }
}

/**
 * @param actorId
 * @param delta
 * @param worldId
 * @returns {Promise<number | null>}
 */
export async function applyHappinessDelta(
  actorId: string,
  delta: number,
  worldId?: string,
): Promise<number | null> {
  try {
    const res = await apiFetch(`/api/v1/actors/${actorId}/mood/delta`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: jsonBody({ delta, worldId, },),
    },);

    if (res.ok) { return await res.json(); }
    return null;
  } catch {
    return null;
  }
}
