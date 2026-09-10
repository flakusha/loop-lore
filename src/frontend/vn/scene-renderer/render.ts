// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import {
  preloadSceneImages,
  type SceneImages,
} from "../image-preloader";
import { getPortraitUrl, } from "../portrait-manager";
import { state, } from "./state";
import type { VnMessage, VnScene, } from "./types";

/**
 * @param msg
 */
export function msgToScene(msg: VnMessage,): VnScene {
  const displayName = msg.name ?? (msg.role === "user" ? "You" : (msg.role === "system" ? "System" : "Character"));
  const speakerId = msg.speakerId ?? (msg.role === "narration"
    ? null
    : (displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-",).replace(/^-+|-+$/g, "",) || msg.role));
  return {
    messageId: msg.id,
    backgroundUrl: msg.background_url,
    characterName: displayName,
    characterAvatar: msg.avatar_asset_id,
    text: msg.content,
    thinking: msg.thinking,
    role: msg.role,
    attachments: msg.attachments,
    cast: msg.cast ?? (speakerId === null
      ? []
      : [{ characterId: speakerId, name: displayName, avatarAssetId: msg.avatar_asset_id, },]),
    speakerId,
    emotion: msg.emotion,
  };
}

// ── Image Preloading ─────────────────────────────────────────

/** */
export async function preloadCurrentAndUpcoming(): Promise<void> {
  const indicator = state.loadingIndicator;
  if (!indicator || state.scenes.length === 0) { return; }

  indicator.show();

  const sceneImages = Array.from(state.scenes, (s,): SceneImages => ({
    backgroundUrl: s.backgroundUrl,
    portraitUrl: s.characterAvatar
      ? getPortraitUrl(s.characterAvatar,)
      : undefined,
  }),);

  const stats = await preloadSceneImages(sceneImages, state.currentIndex, 2,);
  indicator.updateProgress(stats.loaded + stats.cached, stats.total,);

  // Hide after a short delay to show completion
  setTimeout(() => {
    indicator?.hide();
  }, 500,);
}

/**
 * Handle a `chat:location-changed` event: briefly fade the active scene out and
 * back in to signal a location/travel transition. Only acts when the VN
 * renderer is mounted and the event targets the currently-rendered chat.
 * @param e
 */
export function handleLocationChanged(e: Event,): void {
  const detail = (e as CustomEvent<{ chatId?: string; locationId?: string; locationName?: string | null }>).detail;
  if (detail?.chatId && state.currentChatId && detail.chatId !== state.currentChatId) { return; }
  const container = state.container;
  if (!container || !state.settings) { return; }
  const sceneEl = container.querySelector<HTMLElement>(".vn-scene",);
  if (!sceneEl) { return; }
  sceneEl.style.transition = "opacity 280ms ease";
  sceneEl.style.opacity = "0";
  globalThis.setTimeout(() => {
    if (!sceneEl.isConnected) {
      return;
    }

    sceneEl.style.opacity = "1";
    globalThis.setTimeout(() => {
      if (sceneEl.isConnected) { sceneEl.style.transition = ""; }
    }, 300,);
  }, 260,);
}
