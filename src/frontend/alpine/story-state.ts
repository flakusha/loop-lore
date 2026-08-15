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
import { jsonBody, jsonParseOr, } from "./json";
import { log as rootLog, } from "./logger";
import { storyControl, } from "./story-controls";
import {
  fetchChatDetail,
  fetchLocationState,
  fetchNpcsAt,
  fetchParticipants,
  fetchQuests,
  fetchStoryTurns,
  fetchWorldName,
} from "./story-state/api";
import {
  activeChatId,
  mapParticipants,
  parseQuestBanners,
  qualityClass as qualityClassTier,
  questProgressPct as questProgressPercent,
  summarizeTurns,
  toast,
} from "./story-state/derived";
import type { QuestBanner, StoryQuest, StoryStateComponent, StoryTurnMeta, } from "./story-state/types";
export type {
  QuestBanner,
  StoryParticipant,
  StoryQuest,
  StoryStateComponent,
  StoryTurnMeta,
  StoryWorldState,
} from "./story-state/types";

const log = rootLog.child({ module: "story-state", },);

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
    _worldId: null,
    _locationId: null,

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
        this.error = error instanceof Error ? error.message : String(error,);
        log.warn("Story state load failed", { chatId, error, },);
      } finally {
        this.loading = false;
      }
    },

    turnForMessage(messageId: string,): StoryTurnMeta | null {
      return this.turnMeta[messageId] ?? null;
    },

    questProgressPct(quest: StoryQuest,): number {
      return questProgressPercent(quest,);
    },

    /** CSS tier for a quality score: good (≥70) / mid (≥40) / low. */
    qualityClass(score: number,): string {
      return qualityClassTier(score,);
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
      const worldId = this._worldId;
      if (!worldId || !name.trim()) { return; }
      try {
        const res = await apiFetch(`/api/worlds/${worldId}/quests`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ name: name.trim(), type: "composite", },),
        },);
        if (res.ok) {
          await this._loadQuests();
          this.notify("Quest created",);
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
          const { quests, } = this;
          for (let i = quests.length - 1; i >= 0; i--) {
            const quest = quests[i];
            if (quest?.id === questId) { quests.splice(i, 1,); }
          }
          this.notify("Quest deleted",);
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
      const chat = await fetchChatDetail(chatId,);
      if (!chat) { return; }
      const gmConfig = jsonParseOr<{ storyMode?: boolean }>(chat.gm_config ?? "{}", {},);
      this.isStoryMode = chat.mode === "story" || gmConfig.storyMode === true;
      this._worldId = chat.world_id ?? null;
      this._locationId = chat.current_location_id ?? null;
      if (chat.world_id) {
        this.worldName = await fetchWorldName(chat.world_id,);
      }
    },

    async _loadTurns(): Promise<void> {
      if (!this.chatId) { return; }
      const summary = summarizeTurns(await fetchStoryTurns(this.chatId,),);
      this.turnMeta = summary.turnMeta;
      this.turnNumber = summary.turnNumber;
      this.promptSent = summary.promptSent;
      this.running = summary.running;
      this.banners = summary.banners;
    },

    /** Parse quest_progress JSON from a turn into display banners. */
    _parseQuestBanners(raw: string,): QuestBanner[] {
      return parseQuestBanners(raw,);
    },

    async _loadQuests(): Promise<void> {
      const worldId = this._worldId;
      if (!worldId) { return; }
      this.quests = await fetchQuests(worldId,);
    },

    async _loadWorldState(): Promise<void> {
      const locationId = this._locationId;
      const worldId = this._worldId;
      if (!locationId) { return; }
      // Location state (time/weather/atmosphere) — best-effort, tolerate shape drift.
      const state = await fetchLocationState(locationId,);
      if (state) {
        this.worldState.timeOfDay = state.timeOfDay;
        this.worldState.weather = state.weather;
        this.worldState.atmosphere = state.atmosphere;
        this.worldState.description = state.description;
      }
      // NPCs present at the current location.
      if (worldId) {
        const npcs = await fetchNpcsAt(worldId, locationId,);
        if (npcs) { this.worldState.npcs = npcs; }
      }
    },

    async _loadParticipants(): Promise<void> {
      const chatId = this.chatId;
      if (!chatId) { return; }
      const participants = await fetchParticipants(chatId,);
      if (!participants) { return; }
      const mapped = mapParticipants(participants,);
      this.actors = mapped.actors;
      this.nextActorName = mapped.nextActorName;
    },
  };
  return component;
};
