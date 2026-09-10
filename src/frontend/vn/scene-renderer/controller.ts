// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { destroyChoiceCards, } from "../choice-cards";
import { createLoadingIndicator, } from "../image-preloader";
import { getVnSettings, } from "../settings";
import { addToRoster, createRoster, } from "../sprite-stage";
import {
  handleLocationChanged,
  msgToScene,
  preloadCurrentAndUpcoming,
} from "./render";
import {
  renderCurrentScene,
  type SceneNavigator,
} from "./render-scene";
import { state, } from "./state";
import type { VnMessage, } from "./types";

const navigate: SceneNavigator = { next: nextScene, prev: prevScene, };

/**
 * Rebuild the per-chat sprite roster from the loaded scenes.
 * Scenes already carry their cast (msgToScene synthesizes single-speaker
 * entries), so the roster is the union of every scene cast in order.
 */
function syncRosterFromScenes(): void {
  const roster = createRoster();
  for (const scene of state.scenes) {
    for (const member of scene.cast ?? []) {
      addToRoster(roster, member,);
    }
  }
  state.roster = roster;
}

/**
 * Initialize the VN scene renderer.
 * @param containerEl
 * @param messages
 * @param gmConfig
 * @param chatId
 */
export function initVnRenderer(
  containerEl: HTMLElement,
  messages: VnMessage[],
  gmConfig?: Record<string, unknown>,
  chatId?: string,
): void {
  state.container = containerEl;
  state.settings = getVnSettings(gmConfig,);
  state.scenes = Array.from(messages, (msg,) => msgToScene(msg,),);
  syncRosterFromScenes();
  state.currentIndex = Math.max(0, state.scenes.length - 1,);
  state.currentChatId = chatId ?? null;
  state.loadingIndicator = createLoadingIndicator(containerEl,);

  // React to chat location changes (frontend-driven) with a short travel
  // transition. Safe by design: this consumes a frontend DOM event and never
  // touches location access-check logic.
  if (state.locationChangeHandler) {
    globalThis.removeEventListener("chat:location-changed", state.locationChangeHandler,);
  }
  state.locationChangeHandler = handleLocationChanged;
  globalThis.addEventListener("chat:location-changed", state.locationChangeHandler,);

  // Preload images for current and upcoming scenes
  void preloadCurrentAndUpcoming();

  renderCurrentScene(false, navigate,);
}

/**
 * Destroy the VN renderer, cleaning up DOM.
 */
export function destroyVnRenderer(): void {
  if (state.locationChangeHandler) {
    globalThis.removeEventListener("chat:location-changed", state.locationChangeHandler,);
    state.locationChangeHandler = null;
  }
  destroyChoiceCards();
  state.loadingIndicator = null;
  if (state.container) {
    state.container.replaceChildren();
    state.container = null;
  }
  state.scenes = [];
  state.currentIndex = 0;
  state.settings = null;
  state.currentChatId = null;
  state.roster = null;
}

/**
 * Navigate to the next scene.
 */
export function nextScene(): void {
  if (state.currentIndex >= state.scenes.length - 1) {
    return;
  }

  state.currentIndex++;
  void preloadCurrentAndUpcoming();
  renderCurrentScene(true, navigate,);
}

/**
 * Navigate to the previous scene.
 */
export function prevScene(): void {
  if (state.currentIndex <= 0) {
    return;
  }

  state.currentIndex--;
  void preloadCurrentAndUpcoming();
  renderCurrentScene(true, navigate,);
}

/**
 * Jump to a specific scene index.
 * @param index
 */
export function jumpToScene(index: number,): void {
  if (!(index >= 0 && index < state.scenes.length)) {
    return;
  }

  state.currentIndex = index;
  void preloadCurrentAndUpcoming();
  renderCurrentScene(true, navigate,);
}

/**
 * Get current scene index.
 */
export function getCurrentSceneIndex(): number {
  return state.currentIndex;
}

/**
 * Get total scene count.
 */
export function getSceneCount(): number {
  return state.scenes.length;
}

/**
 * Add a new scene from an incoming message (for live streaming).
 * @param message
 */
export function addScene(message: VnMessage,): void {
  const scene = msgToScene(message,);
  state.scenes.push(scene,);
  if (!state.roster) { state.roster = createRoster(); }
  for (const member of scene.cast ?? []) {
    addToRoster(state.roster, member,);
  }
  state.currentIndex = state.scenes.length - 1;
  void preloadCurrentAndUpcoming();
  renderCurrentScene(true, navigate,);
}
