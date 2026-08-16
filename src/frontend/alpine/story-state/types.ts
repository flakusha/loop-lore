// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Story-state types.
 *
 * Read-model interfaces for the story-mode chat view: story turns, world
 * quests, world state, participants and the `StoryStateComponent` exposed on
 * `window.storyState`. Re-exported from `story-state.ts` so the public API
 * surface is unchanged.
 */

/** A participant in the story (turn order + GM status). */
export interface StoryParticipant {
  id: string;
  name: string;
  type: string;
  role: string;
  isActive: boolean;
  order: number;
}

/** Quest row as exposed by GET /api/worlds/:worldId/quests. */
export interface StoryQuest {
  id: string;
  name: string;
  type: string;
  status: string;
  progress: number;
}

/** Per-message story metadata (quality score, GM prompt) from story_turns. */
export interface StoryTurnMeta {
  turnNumber: number;
  qualityScore: number | null;
  promptSent: string;
  status: string;
}

/** World-state summary for the GM panel (best-effort reads). */
export interface StoryWorldState {
  timeOfDay: string | null;
  weather: string | null;
  atmosphere: string | null;
  description: string | null;
  npcs: { actorId: string; displayName: string }[];
}

/** Quest progress event announced by the latest story turn. */
export interface QuestBanner {
  questName: string;
  progress: number;
}

/** Turn row from GET /api/chats/:id/story-turns (subset we consume). */
export interface StoryTurnRow {
  id: string;
  turn_number: number;
  parent_message_id: string | null;
  actor_id: string | null;
  prompt_sent: string;
  quality_score: number | null;
  status: string;
  quest_progress: string;
}

/** Chat detail row from GET /api/v1/chats/:id (subset we consume). */
export interface StoryChatDetail {
  mode?: string;
  world_id?: string | null;
  current_location_id?: string | null;
  gm_config?: string | null;
  turn_strategy?: string | null;
}

/** The story-state component factory's return shape. */
export interface StoryStateComponent {
  chatId: string | null;
  isStoryMode: boolean;
  running: boolean;
  worldName: string | null;
  turnNumber: number | null;
  promptSent: string | null;
  nextActorName: string | null;
  actors: StoryParticipant[];
  quests: StoryQuest[];
  worldState: StoryWorldState;
  banners: QuestBanner[];
  turnMeta: Record<string, StoryTurnMeta>;
  loading: boolean;
  error: string | null;
  /** Id of the story's world (loaded from the chat detail). */
  _worldId: string | null;
  /** Id of the story's current location (loaded from the chat detail). */
  _locationId: string | null;
  init(): Promise<void>;
  refresh(): Promise<void>;
  turnForMessage(messageId: string,): StoryTurnMeta | null;
  questProgressPct(quest: StoryQuest,): number;
  qualityClass(score: number,): string;
  togglePause(): Promise<void>;
  stepTurn(): Promise<void>;
  escalateToMe(): Promise<void>;
  injectNarration(): Promise<void>;
  createQuest(name: string,): Promise<void>;
  deleteQuest(questId: string,): Promise<void>;
  notify(message: string, type?: string,): void;
  _activeChatId(): string | null;
  _loadChat(): Promise<void>;
  _loadTurns(): Promise<void>;
  _loadQuests(): Promise<void>;
  _loadWorldState(): Promise<void>;
  _loadParticipants(): Promise<void>;
  _parseQuestBanners(raw: string,): QuestBanner[];
}
