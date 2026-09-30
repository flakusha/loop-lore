// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Mood Panel — Alpine component factory ──
import { apiFetch, } from "../htmx";
import { jsonBody, } from "../json";
import { log as rootLog, } from "../logger";
import { happinessColor, moodToEmoji, moodToLabel, } from "./helpers";
import type { EmotionDefinition, MoodPanelState, } from "./types";

const log = rootLog.child({ module: "mood-panel", },);

/**
 * @returns {MoodPanelState}
 */
export function createMoodPanelState(): MoodPanelState {
  return {
    mood: null,
    emotions: [],
    emotionDefs: [],
    loading: false,
    _happinessDelta: 5,

    /**
     * @param {string} actorId
     * @returns {Promise<void>}
     */
    async loadMood(actorId: string,) {
      try {
        const res = await apiFetch(`/api/v1/actors/${actorId}/mood`,);
        if (res.ok) { this.mood = await res.json(); }
      } catch (error) {
        // 404 is the documented answer for "actor has no mood record yet"
        // (src/routes/character-mood/state.ts); only real failures are logged.
        if ((error as Error & { status?: number }).status === 404) { return; }
        log.error("Failed to load mood", undefined, { actorId, },);
      }
    },

    /**
     * @param {string} actorId
     * @returns {Promise<void>}
     */
    async loadEmotions(actorId: string,) {
      try {
        const res = await apiFetch(`/api/v1/actors/${actorId}/emotions`,);
        if (res.ok) { this.emotions = await res.json(); }
      } catch {
        log.error("Failed to load emotions", undefined, { actorId, },);
      }
    },

    /**
     * @returns {Promise<void>}
     */
    async loadEmotionDefs() {
      try {
        const res = await apiFetch("/api/v1/emotions",);
        if (res.ok) { this.emotionDefs = await res.json(); }
      } catch {
        log.error("Failed to load emotion definitions",);
      }
    },

    /**
     * @param {string} actorId
     * @param {number} delta
     * @returns {Promise<void>}
     */
    async applyHappinessDelta(actorId: string, delta: number,) {
      try {
        const res = await apiFetch(`/api/v1/actors/${actorId}/mood/delta`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ delta, },),
        },);
        if (res.ok) {
          const newHappiness = await res.json();
          if (this.mood) {
            this.mood.happiness = newHappiness;
            this.mood.currentMood = this.happinessToMood(newHappiness,);
          }
        }
      } catch {
        log.error("Failed to apply happiness delta", undefined, { actorId, delta, },);
      }
    },

    /**
     * @returns {string}
     */
    getMoodEmoji() {
      return moodToEmoji(this.mood?.currentMood ?? "neutral",);
    },

    /**
     * @returns {string}
     */
    getMoodLabel() {
      return moodToLabel(this.mood?.currentMood ?? "neutral",);
    },

    /**
     * @returns {string}
     */
    getHappinessColor() {
      return happinessColor(this.mood?.happiness ?? 50,);
    },

    /**
     * @returns {{ def: EmotionDefinition; intensity: number; }[]}
     */
    getActiveEmotions() {
      const defs = new Map<string, EmotionDefinition>();
      for (const d of this.emotionDefs) {
        defs.set(d.id, d,);
      }
      const result: { def: EmotionDefinition; intensity: number }[] = [];
      for (const e of this.emotions) {
        const def = defs.get(e.emotion_id,);
        if (def) {
          result.push({ def, intensity: e.intensity, },);
        }
      }
      return result;
    },

    /**
     * @param {number} happiness
     * @returns {"ecstatic" | "happy" | "neutral" | "sad" | "miserable"}
     */
    happinessToMood(happiness: number,) {
      if (happiness >= 80) { return "ecstatic"; }
      if (happiness >= 60) { return "happy"; }
      if (happiness >= 45) { return "neutral"; }
      if (happiness >= 25) { return "sad"; }
      return "miserable";
    },
  } as MoodPanelState;
}
