// ── Mood Panel — Alpine component for character mood/emotions ──
import { apiFetch, } from "./htmx";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "mood-panel", },);

export interface MoodState {
  id: string;
  actorId: string;
  worldId: string | null;
  happiness: number;
  baseMood: string;
  currentMood: string;
  moodStability: number;
  expressionModifiers: Record<string, number>;
  lastMoodChange: string;
}

export interface EmotionEntry {
  id: string;
  actor_id: string;
  emotion_id: string;
  intensity: number;
  context: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmotionDefinition {
  id: string;
  name: string;
  display_name: string;
  category: string;
  valence: number;
  arousal: number;
  icon: string | null;
}

export interface MoodPanelState {
  mood: MoodState | null;
  emotions: EmotionEntry[];
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

export function createMoodPanelState(): MoodPanelState {
  return {
    mood: null,
    emotions: [],
    emotionDefs: [],
    loading: false,
    _happinessDelta: 5,

    async loadMood(actorId: string,) {
      try {
        const res = await apiFetch(`/api/actors/${actorId}/mood`,);
        if (res.ok) { this.mood = await res.json(); }
      } catch {
        log.error("Failed to load mood", undefined, { actorId, },);
      }
    },

    async loadEmotions(actorId: string,) {
      try {
        const res = await apiFetch(`/api/actors/${actorId}/emotions`,);
        if (res.ok) { this.emotions = await res.json(); }
      } catch {
        log.error("Failed to load emotions", undefined, { actorId, },);
      }
    },

    async loadEmotionDefs() {
      try {
        const res = await apiFetch("/api/emotions",);
        if (res.ok) { this.emotionDefs = await res.json(); }
      } catch {
        log.error("Failed to load emotion definitions",);
      }
    },

    async applyHappinessDelta(actorId: string, delta: number,) {
      try {
        const res = await apiFetch(`/api/actors/${actorId}/mood/delta`, {
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

    getMoodEmoji() {
      return moodToEmoji(this.mood?.currentMood ?? "neutral",);
    },

    getMoodLabel() {
      return moodToLabel(this.mood?.currentMood ?? "neutral",);
    },

    getHappinessColor() {
      return happinessColor(this.mood?.happiness ?? 50,);
    },

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

    happinessToMood(happiness: number,) {
      if (happiness >= 80) { return "ecstatic"; }
      if (happiness >= 60) { return "happy"; }
      if (happiness >= 45) { return "neutral"; }
      if (happiness >= 25) { return "sad"; }
      return "miserable";
    },
  } as MoodPanelState;
}

// ── Standalone functions for use outside Alpine component ──────

export async function fetchMood(actorId: string,): Promise<MoodState | null> {
  try {
    const res = await apiFetch(`/api/actors/${actorId}/mood`,);
    if (res.ok) { return await res.json(); }
    return null;
  } catch {
    return null;
  }
}

export async function fetchEmotions(actorId: string,): Promise<EmotionEntry[]> {
  try {
    const res = await apiFetch(`/api/actors/${actorId}/emotions`,);
    if (res.ok) { return await res.json(); }
    return [];
  } catch {
    return [];
  }
}

export async function fetchEmotionDefs(): Promise<EmotionDefinition[]> {
  try {
    const res = await apiFetch("/api/emotions",);
    if (res.ok) { return await res.json(); }
    return [];
  } catch {
    return [];
  }
}

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

export function moodToEmoji(mood: string,): string {
  switch (mood) {
    case "ecstatic": {
      return "😄";
    }
    case "happy": {
      return "😊";
    }
    case "neutral": {
      return "😐";
    }
    case "sad": {
      return "😢";
    }
    case "miserable": {
      return "😞";
    }
    default: {
      return "😐";
    }
  }
}

export function moodToLabel(mood: string,): string {
  switch (mood) {
    case "ecstatic": {
      return "Ecstatic";
    }
    case "happy": {
      return "Happy";
    }
    case "neutral": {
      return "Neutral";
    }
    case "sad": {
      return "Sad";
    }
    case "miserable": {
      return "Miserable";
    }
    default: {
      return "Unknown";
    }
  }
}

export function happinessColor(happiness: number,): string {
  if (happiness >= 80) { return "var(--accent-green,)"; }
  if (happiness >= 60) { return "var(--accent-blue,)"; }
  if (happiness >= 45) { return "var(--text-secondary,)"; }
  if (happiness >= 25) { return "var(--accent-yellow,)"; }
  return "var(--accent-red,)";
}
