// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { MoodState, } from "../../../characters/services/mood-service/types";

// ── Mood Panel — shared types ──

export type { MoodState, };

/** */
export interface EmotionLogEntry {
  id: string;
  actor_id: string;
  emotion_id: string;
  intensity: number;
  context: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

/** */
export interface EmotionDefinition {
  id: string;
  name: string;
  display_name: string;
  category: string;
  valence: number;
  arousal: number;
  icon: string | null;
}

/** */
export interface MoodPanelState {
  mood: MoodState | null;
  emotions: EmotionLogEntry[];
  emotionDefs: EmotionDefinition[];
  loading: boolean;
  _happinessDelta: number;
  loadMood(actorId: string,): Promise<void>;
  loadEmotions(actorId: string,): Promise<void>;
  loadEmotionDefs(): Promise<void>;
  applyHappinessDelta(actorId: string, delta: number,): Promise<void>;
  getMoodEmoji(): string;
  getMoodLabel(): string;
  getHappinessColor(): string;
  getActiveEmotions(): { def: EmotionDefinition; intensity: number }[];
  happinessToMood(happiness: number,): string;
}
