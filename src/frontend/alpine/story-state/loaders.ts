// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Story-state data loaders.
 *
 * Backend-fetching methods for the story-state component: chat detail, story
 * turns, world quests, location/world state and participants. Extracted so
 * `story-state.ts` stays under the 250L file-size guard. These use `this` and
 * are spread into the component record, so they read and write component state
 * directly.
 */

import { jsonParseOr, } from "../json";
import {
  fetchChatDetail,
  fetchLocationState,
  fetchNpcsAt,
  fetchParticipants,
  fetchQuests,
  fetchStoryTurns,
  fetchWorldName,
} from "./api";
import { mapParticipants, summarizeTurns, } from "./derived";
import type { StoryStateComponent, } from "./types";

/** Backend loaders for the story-state component (bound via `this`). */
export const loaders = {
  async _loadChat(this: StoryStateComponent,): Promise<void> {
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

  async _loadTurns(this: StoryStateComponent,): Promise<void> {
    if (!this.chatId) { return; }
    const summary = summarizeTurns(await fetchStoryTurns(this.chatId,),);
    this.turnMeta = summary.turnMeta;
    this.turnNumber = summary.turnNumber;
    this.promptSent = summary.promptSent;
    this.running = summary.running;
    this.banners = summary.banners;
  },

  async _loadQuests(this: StoryStateComponent,): Promise<void> {
    const worldId = this._worldId;
    if (!worldId) { return; }
    this.quests = await fetchQuests(worldId,);
  },

  async _loadWorldState(this: StoryStateComponent,): Promise<void> {
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

  async _loadParticipants(this: StoryStateComponent,): Promise<void> {
    const chatId = this.chatId;
    if (!chatId) { return; }
    const participants = await fetchParticipants(chatId,);
    if (!participants) { return; }
    const mapped = mapParticipants(participants,);
    this.actors = mapped.actors;
    this.nextActorName = mapped.nextActorName;
  },
};
