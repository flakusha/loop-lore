// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ChatState, } from "./../types";

export const moodStateProps: Partial<ChatState> & ThisType<ChatState> = {
  _mood: null as {
    happiness: number;
    currentMood: string;
    baseMood: string;
    moodStability: number;
    lastMoodChange: string;
    expressionModifiers: Record<string, number>;
  } | null,
  _moodLoading: false,
  _moodCanEdit: false,
  _moodSliderValue: 50,
  _activeChatWorldId: null as string | null,
  _emotionAvatars: [] as { emotion: string; avatarId: string; assetId: string }[],
  _emotionAvatarsLoading: false,
  _currentEmotionAvatar: null as string | null,
  _emotionGenRunning: false,
  _emotionGenStatus: null as string | null,
  _emotionGenJobId: null as string | null,

  /** Active emotions for the current character (joined with definitions). */
  _activeEmotions: [] as {
    def: { id: string; icon: string | null; display_name: string };
    intensity: number;
  }[],
  _activeEmotionsLoading: false,
};
