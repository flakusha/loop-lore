/**
 * Story State — Alpine component for the story-mode chat view.
 *
 * Loads the story-mode read model for the active chat: story turns (next
 * actor, quality scores, GM prompt), world quests (progress), world state
 * (location time/weather, NPCs present) and participants (turn order). Exposes
 * derived state (`isStoryMode`, `running`, `nextActor`, quest progress) plus
 * control actions (pause/step/escalate/inject narration) that delegate to the
 * story-engine backend via `story-controls`.
 *
 * Registered as `window.storyState`; used from `story-view.html`,
 * `gm-story-panel.html` and `message-list.html`.
 */

import { apiFetch, } from "./htmx";
import { jsonParseOr, } from "./json";
import { log as rootLog, } from "./logger";
import { storyControl, } from "./story-controls";

const log = rootLog.child({ module: "story-state", },);

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
interface StoryTurnRow {
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
interface StoryChatDetail {
  mode?: string;
  world_id?: string | null;
  current_location_id?: string | null;
  gm_config?: string | null;
  turn_strategy?: string | null;
}

export interface StoryStateComponent {  chatId: string | null;
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

/** Resolve the active chat id from the global Alpine `chat` store. */
function activeChatId(): string | null {
  const alpine = (globalThis as { Alpine?: { store: (name: string,) => Record<string, unknown> } }).Alpine;
  const chat = alpine?.store("chat",) as { currentChat?: { id?: string } } | undefined;
  return chat?.currentChat?.id ?? null;
}

/** Post a toast via the app store (no-op when the store is unavailable). */
function toast(message: string, type = "info",): void {
  try {
    const alpine = (globalThis as { Alpine?: { store: (name: string,) => { toast: (t: string, m: string,) => void } } }).Alpine;
    alpine?.store("app",)?.toast(type, message,);
  } catch {
    /* toast is best-effort */
  }
}

(globalThis as unknown as Record<string, unknown>).storyState = function(): StoryStateComponent {
  const component: StoryStateComponent = {
    chatId: null,
    isStoryMode: false,
    running: false,
    worldName: null,
    turnNumber: null,
    promptSent: null,
    nextActorName: null,
    actors: [],
    quests: [],
    worldState: { timeOfDay: null, weather: null, atmosphere: null, description: null, npcs: [], },
    banners: [],
    turnMeta: {},
    loading: false,
    error: null,

    init(): Promise<void> {
      return this.refresh();
    },

    async refresh(): Promise<void> {
      const chatId = this._activeChatId();
      if (!chatId) { return; }
      this.chatId = chatId;
      this.loading = true;
      this.error = null;
      try {
        await this._loadChat();
        if (!this.isStoryMode) { return; }
        await Promise.allSettled([
          this._loadTurns(),
          this._loadQuests(),
          this._loadWorldState(),
          this._loadParticipants(),
        ],);
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
        log.warn("Story state load failed", { chatId, error, },);
      } finally {
        this.loading = false;
      }
    },

    turnForMessage(messageId: string,): StoryTurnMeta | null {
      return this.turnMeta[messageId] ?? null;
    },

    questProgressPct(quest: StoryQuest,): number {
      return Math.max(0, Math.min(100, Math.round(quest.progress,),),);
    },

    /** CSS tier for a quality score: good (≥70) / mid (≥40) / low. */
    qualityClass(score: number,): string {
      if (score >= 70) { return "is-good"; }
      if (score >= 40) { return "is-mid"; }
      return "is-low";
    },

    async togglePause(): Promise<void> {
      const id = this.chatId;
      if (!id) { return; }
      const result = await storyControl(id, this.running ? "pause" : "resume",);
      if (!result.ok) {
        this.notify(result.message ?? "story control failed", "error",);
        return;
      }
      this.running = !this.running;
    },

    async stepTurn(): Promise<void> {
      if (!this.chatId) { return; }
      const result = await storyControl(this.chatId, "step",);
      if (!result.ok) { this.notify(result.message ?? "step unavailable", "error",); }
    },

    async escalateToMe(): Promise<void> {
      if (!this.chatId) { return; }
      const result = await storyControl(this.chatId, "escalate",);
      if (!result.ok) { this.notify(result.message ?? "escalation unavailable", "error",); }
    },

    async injectNarration(): Promise<void> {
      if (!this.chatId) { return; }
      const result = await storyControl(this.chatId, "narration",);
      if (!result.ok) { this.notify(result.message ?? "narration unavailable", "error",); }
    },

    async createQuest(name: string,): Promise<void> {
      const worldId = (this as unknown as { _worldId: string | null })._worldId;
      if (!worldId || !name.trim()) { return; }
      try {
        const res = await apiFetch(`/api/worlds/${worldId}/quests`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ name: name.trim(), type: "composite", }),
        },);
        if (res.ok) {
          await this._loadQuests();
          this.notify("Quest created");
        } else {
          this.notify("Quest creation failed", "error",);
        }
      } catch (error) {
        log.warn("Quest creation failed", { worldId, error, },);
        this.notify("Quest creation failed", "error",);
      }
    },

    async deleteQuest(questId: string,): Promise<void> {
      try {
        const res = await apiFetch(`/api/quests/${questId}`, { method: "DELETE", },);
        if (res.ok) {
          this.quests = this.quests.filter((q,) => q.id !== questId,);
          this.notify("Quest deleted");
        } else {
          this.notify("Quest deletion failed", "error",);
        }
      } catch (error) {
        log.warn("Quest deletion failed", { questId, error, },);
        this.notify("Quest deletion failed", "error",);
      }
    },

    notify(message: string, type = "info",): void {
      toast(message, type,);
    },

    _activeChatId(): string | null {
      return activeChatId();
    },

    async _loadChat(): Promise<void> {
      const chatId = this.chatId;
      if (!chatId) { return; }
      const res = await apiFetch(`/api/v1/chats/${chatId}`, { headers: { Accept: "application/json", }, },);
      if (!res.ok) { return; }
      const chat = await res.json() as StoryChatDetail;
      const gmConfig = jsonParseOr<{ storyMode?: boolean }>(chat.gm_config ?? "{}", {},);
      this.isStoryMode = chat.mode === "story" || gmConfig.storyMode === true;
      (this as unknown as { _worldId: string | null })._worldId = chat.world_id ?? null;
      (this as unknown as { _locationId: string | null })._locationId = chat.current_location_id ?? null;
      if (chat.world_id) {
        try {
          const worldRes = await apiFetch(`/api/worlds/${chat.world_id}`,);
          if (worldRes.ok) {
            const world = await worldRes.json() as { name?: string };
            this.worldName = world.name ?? null;
          }
        } catch (error) {
          log.warn("World name load failed", { worldId: chat.world_id, error, },);
        }
      }
    },

    async _loadTurns(): Promise<void> {
      const chatId = this.chatId;
      if (!chatId) { return; }
      const res = await apiFetch(`/api/chats/${chatId}/story-turns?pageSize=50`,);
      if (!res.ok) { return; }
      const data = await res.json() as { data?: StoryTurnRow[] };
      const turns = data.data ?? [];
      this.turnMeta = {};
      let latest: StoryTurnRow | null = null;
      for (const turn of turns) {
        if (turn.parent_message_id) {
          this.turnMeta[turn.parent_message_id] = {
            turnNumber: turn.turn_number,
            qualityScore: turn.quality_score ?? null,
            promptSent: turn.prompt_sent ?? "",
            status: turn.status,
          };
        }
        if (!latest || turn.turn_number > latest.turn_number) { latest = turn; }
      }
      if (latest) {
        this.turnNumber = latest.turn_number;
        this.promptSent = latest.prompt_sent ?? null;
        this.running = latest.status === "pending" || latest.status === "in_progress";
        this.banners = this._parseQuestBanners(latest.quest_progress,);
      } else {
        this.turnNumber = null;
        this.promptSent = null;
        this.running = false;
        this.banners = [];
      }
    },

    /** Parse quest_progress JSON from a turn into display banners. */
    _parseQuestBanners(raw: string,): QuestBanner[] {
      const entries = jsonParseOr<{ quest_name?: string; questName?: string; progress?: number }[]>(raw, [],);
      const banners: QuestBanner[] = [];
      for (const entry of entries) {
        if (typeof entry.progress !== "number") { continue; }
        banners.push({
          questName: entry.quest_name ?? entry.questName ?? "Quest",
          progress: Math.round(entry.progress,),
        },);
      }
      return banners;
    },

    async _loadQuests(): Promise<void> {
      const worldId = (this as unknown as { _worldId: string | null })._worldId;
      if (!worldId) { return; }
      const res = await apiFetch(`/api/worlds/${worldId}/quests?pageSize=100`,);
      if (!res.ok) { return; }
      const data = await res.json() as { data?: StoryQuest[] };
      this.quests = data.data ?? [];
    },

    async _loadWorldState(): Promise<void> {
      const locationId = (this as unknown as { _locationId: string | null })._locationId;
      const worldId = (this as unknown as { _worldId: string | null })._worldId;
      if (!locationId) { return; }
      // Location state (time/weather/atmosphere) — best-effort, tolerate shape drift.
      try {
        const res = await apiFetch(`/api/locations/${locationId}/state`,);
        if (res.ok) {
          const row = await res.json() as Record<string, unknown>;
          const state = (row.state as Record<string, unknown>) ?? row;
          this.worldState.timeOfDay = typeof state.time_of_day === "string" ? state.time_of_day : null;
          this.worldState.weather = typeof state.weather === "string" ? state.weather : null;
          this.worldState.atmosphere = typeof state.atmosphere === "string" ? state.atmosphere : null;
          this.worldState.description = typeof state.description_override === "string"
            ? state.description_override
            : null;
        }
      } catch (error) {
        log.warn("Location state load failed", { locationId, error, },);
      }
      // NPCs present at the current location.
      if (worldId) {
        try {
          const res = await apiFetch(`/api/worlds/${worldId}/npcs-at/${locationId}`,);
          if (res.ok) {
            this.worldState.npcs = await res.json() as { actorId: string; displayName: string }[];
          }
        } catch (error) {
          log.warn("NPC-at-location load failed", { worldId, locationId, error, },);
        }
      }
    },

    async _loadParticipants(): Promise<void> {
      const chatId = this.chatId;
      if (!chatId) { return; }
      try {
        const res = await apiFetch(`/api/v1/chats/${chatId}/participants`,);
        if (!res.ok) { return; }
        const participants = await res.json() as {
          actor_id: string;
          name: string;
          display_name?: string;
          actor_type?: string;
        }[];
        this.actors = participants.map((p, index,) => ({
          id: p.actor_id,
          name: p.display_name ?? p.name,
          type: p.actor_type ?? "character",
          role: p.actor_type === "assistant" ? "gm" : "player",
          isActive: index === 0,
          order: index,
        }),);
        this.nextActorName = this.actors[0]?.name ?? null;
      } catch (error) {
        log.warn("Participants load failed", { chatId, error, },);
      }
    },
  };
  return component;
};
