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

/** Quest row as exposed by GET /api/v1/worlds/:worldId/quests. */
export interface StoryQuest {
  id: string;
  name: string;
  type: string;
  status: string;
  progress: number;
  /** Progress target the quest must reach (absent on legacy rows). */
  target?: number;
  /** Rewards JSON (`{ xp, items }`) string. */
  rewards?: string;
  /** Narrative-hook milestone JSON (`{ progress, narrative }[]`) string. */
  narrative_hooks?: string;
}

/** A narrative-hook milestone parsed from a quest's `narrative_hooks`. */
export interface QuestMilestone {
  progress: number;
  narrative: string;
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

/** Turn row from GET /api/v1/chats/:id/story-turns (subset we consume). */
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

/** World-state snapshot row from GET /api/v1/worlds/:worldId/states. */
export interface WorldStateSnapshot {
  id: string;
  turn_id?: string | null;
  message_id?: string | null;
  description?: string | null;
  created_at?: string | null;
}

/** Body for POST /api/v1/worlds/:worldId/states. */
export interface WorldStateCreateInput {
  turnId?: string;
  messageId?: string;
  description?: string;
}

/** npc_states row as returned by GET /api/v1/worlds/:worldId/npc-states/:actorId. */
export interface NpcStateRow {
  id: string;
  actor_id: string;
  world_id: string;
  location_id: string | null;
  health: number;
  mental_state: string;
  knowledge: string;
  relationships: string;
  schedule: string;
  updated_at: string;
}

/** Editable NPC-state fields sent to PUT /api/v1/worlds/:worldId/npc-states/:actorId. */
export interface NpcStatePatch {
  health?: number;
  mentalState?: string;
  locationId?: string;
}

/** Form draft backing the NPC-state edit inputs (string-typed for x-model). */
export interface NpcStateDraft {
  health: string;
  mentalState: string;
  locationId: string;
}

/** Story turn row from GET /api/v1/chats/:id/story-turns/:turnId. */
export interface StoryTurnDetail {
  id: string;
  chat_id: string;
  turn_number: number;
  parent_message_id: string | null;
  actor_id: string | null;
  prompt_sent: string;
  quality_score: number | null;
  status: string;
  quest_progress: string;
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
  /** World-state snapshots (GM panel world-states section). */
  worldStates: WorldStateSnapshot[];
  /** Total snapshot count from the last world-states page load. */
  worldStatesTotal: number;
  /** Per-NPC story state (GM panel NPC-state section). */
  npcState: NpcStateRow | null;
  /** Actor id the currently loaded npcState belongs to. */
  npcStateActorId: string | null;
  /** String-typed edit draft for the NPC-state form. */
  npcDraft: NpcStateDraft;
  /** Deep-linked story turn detail (turn-by-id lookup). */
  turnDetail: StoryTurnDetail | null;
  /** True while a turn-by-id lookup is in flight. */
  turnDetailLoading: boolean;
  /** True once the chat-context-refresh listener is attached (init guard). */
  _storyRefreshBound?: boolean;
  /** Live story-state SSE subscription (null when offline/unsupported). */
  _storyStream: EventSource | null;
  /** Open (or re-open) the story-state stream for the current world. */
  connectStoryStream(): void;
  /** Close the story-state stream (chat switch / teardown). */
  disconnectStoryStream(): void;
  init(): Promise<void>;
  refresh(): Promise<void>;
  turnForMessage(messageId: string,): StoryTurnMeta | null;
  questProgressPct(quest: StoryQuest,): number;
  /** Only the `active` quests (quest log). */
  activeQuests(): StoryQuest[];
  /** Only the `completed` quests (quest history). */
  completedQuests(): StoryQuest[];
  questMilestones(quest: StoryQuest,): QuestMilestone[];
  questRewardChips(quest: StoryQuest,): string[];
  qualityClass(score: number,): string;
  /** True when the viewer may create world states (owner/GM gate). */
  canManageWorld(): boolean;
  /** Load the paginated world-states list for the story's world. */
  loadWorldStates(): Promise<void>;
  /** Create a world-state snapshot from the form description, then refresh. */
  addWorldState(description: string,): Promise<void>;
  /** Load one NPC's story state and seed the edit draft. */
  loadNpcState(actorId: string,): Promise<void>;
  /** Save the NPC-state draft optimistically; revert on failure. */
  saveNpcState(): Promise<void>;
  /** Load a story turn by id (cached per chatId+turnId). */
  loadStoryTurn(turnId: string,): Promise<void>;
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
