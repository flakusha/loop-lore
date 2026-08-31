// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Mood Panel — standalone async API functions ──
import { apiFetch, } from "../htmx";
import { jsonBody, } from "../json";
import type { EmotionDefinition, EmotionEntry, MoodState, } from "./types";

/**
 * @param actorId
 */
export async function fetchMood(actorId: string,): Promise<MoodState | null> {
  try {
    const res = await apiFetch(`/api/actors/${actorId}/mood`,);
    if (res.ok) { return await res.json(); }
    return null;
  } catch {
    return null;
  }
}

/**
 * @param actorId
 */
export async function fetchEmotions(actorId: string,): Promise<EmotionEntry[]> {
  try {
    const res = await apiFetch(`/api/actors/${actorId}/emotions`,);
    if (res.ok) { return await res.json(); }
    return [];
  } catch {
    return [];
  }
}

/** */
export async function fetchEmotionDefs(): Promise<EmotionDefinition[]> {
  try {
    const res = await apiFetch("/api/emotions",);
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
 */
export async function applyHappinessDelta(
  actorId: string,
  delta: number,
  worldId?: string,
): Promise<number | null> {
  try {
    const res = await apiFetch(`/api/actors/${actorId}/mood/delta`, {
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
