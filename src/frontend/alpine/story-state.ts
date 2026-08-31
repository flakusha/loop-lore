// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";
import { storyControl, } from "./story-controls";
import {
  activeChatId,
  parseQuestBanners,
  qualityClass as qualityClassTier,
  questProgressPct as questProgressPercent,
  toast,
} from "./story-state/derived";
import { loaders, } from "./story-state/loaders";
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
    ...loaders,

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

    /**
     * CSS tier for a quality score: good (≥70) / mid (≥40) / low.
     * @param score
     */
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

    _parseQuestBanners(raw: string,): QuestBanner[] {
      return parseQuestBanners(raw,);
    },
  };
  return component;
};
