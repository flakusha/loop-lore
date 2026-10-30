// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Mood System ───────────────────────────────────────────
/** */
export interface ChatMoodState {
  _mood: {
    happiness: number;
    currentMood: string;
    baseMood: string;
    moodStability: number;
    lastMoodChange: string;
    expressionModifiers: Record<string, number>;
  } | null;
  _moodLoading: boolean;
  _moodCanEdit: boolean;
  _moodSliderValue: number;
  _activeChatWorldId: string | null;
  _emotionAvatars: { emotion: string; avatarId: string; assetId: string }[];
  _emotionAvatarsLoading: boolean;
  /** Per-author emotion variants for group chats, keyed by actor id. */
  _emotionAvatarsByActor: Record<string, { emotion: string; avatarId: string; assetId: string }[]>;
  /** Per-author base portraits for group chats, keyed by actor id. */
  _actorBaseAvatars: Record<string, string>;
  _currentEmotionAvatar: string | null;
  _emotionGenRunning: boolean;
  _emotionGenStatus: string | null;
  _emotionGenJobId: string | null;
  _activeEmotions: { def: { id: string; icon: string | null; display_name: string }; intensity: number }[];
  _activeEmotionsLoading: boolean;
  loadMood(): Promise<void>;
  loadEmotionAvatars(): Promise<void>;
  generateEmotionAvatars(): Promise<void>;
  _pollEmotionJob(actorId: string, jobId: string | null,): Promise<void>;
  loadEmotions(): Promise<void>;
  getActiveEmotions(): { def: { id: string; icon: string | null; display_name: string }; intensity: number }[];
  avatarForMessage(msg: {
    role?: string;
    emotion?: string | null;
    avatar_asset_id?: string | null;
    /** Author actor id (messages.actor_id) — selects the per-actor map. */
    actor_id?: string | null;
  },): string | null;
  selectEmotionAvatar(emotion: string,): string | null;
  updateMoodHappiness(happiness: number,): Promise<void>;
  applyMoodDelta(delta: number,): Promise<void>;
  _happinessToMood(happiness: number,): string;
  _getMoodEmoji(mood: string,): string;
  _getMoodColor(happiness: number,): string;
}
