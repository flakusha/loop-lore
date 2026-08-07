// ── Mood System ───────────────────────────────────────────
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
  avatarForMessage(msg: { role?: string; emotion?: string | null },): string | null;
  selectEmotionAvatar(emotion: string,): string | null;
  updateMoodHappiness(happiness: number,): Promise<void>;
  applyMoodDelta(delta: number,): Promise<void>;
  _happinessToMood(happiness: number,): string;
  _getMoodEmoji(mood: string,): string;
  _getMoodColor(happiness: number,): string;
}
