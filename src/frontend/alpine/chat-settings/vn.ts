// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN (visual novel) renderer wiring for the chat page.
 *
 * Maps chat messages to the VN renderer's message shape and syncs the renderer
 * with the persisted gm_config. Extracted so `chat-settings.ts` stays under the
 * 250L file-size guard.
 */

import { SCENE_ID_ATTR, } from "../../scene/view-mode";
import { destroyVnRenderer, getVnScenes, initVnRenderer, type VnMessage, } from "../../vn";
import { renderQaReport, runQaCheck, type VnQaReport, } from "../../vn/qa-mode";
import { jsonParseOr, } from "../json";
import type { GmConfig, Message, } from "../types";

/**
 * Map a chat-page message to the VN renderer's message shape.
 * @param m
 * @returns {VnMessage}
 */
export function toVnMessage(m: Message,): VnMessage {
  const role = m.role as VnMessage["role"];
  const isVnRole = ["assistant", "user", "system",].includes(role,);
  return {
    id: m.id,
    role: isVnRole ? role : "narration",
    name: m.actor_name,
    content: m.content,
    thinking: m.thinking,
    attachments: m.attachments as VnMessage["attachments"],
  };
}

/**
 * Mirror the active chat's identity onto the VN container as
 * `data-scene-id`. view-mode.ts's watcher resets the camera to orbit
 * on scene swaps; clearing the attribute on teardown keeps a later
 * re-entry a fresh scene attach.
 * @param container
 * @param chatId
 * @returns {void}
 */
export function syncSceneId(
  container: HTMLElement | null,
  chatId: string | undefined,
): void {
  if (!container) { return; }
  if (chatId) {
    container.setAttribute(SCENE_ID_ATTR, chatId,);
  } else {
    container.removeAttribute(SCENE_ID_ATTR,);
  }
}

/** Renderer bridge for syncVnRenderer — injectable for tests. */
export interface VnRendererBridge {
  init(
    container: HTMLElement,
    messages: VnMessage[],
    config: Record<string, unknown>,
    chatId: string | undefined,
    worldId?: string,
  ): void;
  destroy(): void;
}

/** Optional syncVnRenderer inputs. */
export interface VnSyncOptions {
  /** World scope for custom-template resolution. */
  worldId?: string;
  /** Renderer bridge; defaults to the real scene renderer. */
  renderer?: VnRendererBridge;
}

/**
 * (Re)render the active chat as a VN scene when VN mode is enabled, or tear the
 * renderer down when it is disabled. Reads the persisted gm_config so the
 * renderer and the settings modal stay in sync.
 * @param messages
 * @param gmConfig
 * @param vnEnabled
 * @param chatId
 * @param opts.worldId World scope for custom-template resolution.
 * @param opts.renderer Renderer bridge; defaults to the real scene renderer.
 * @returns {void}
 */
export function syncVnRenderer(
  messages: Message[],
  gmConfig: string | null | undefined,
  vnEnabled: boolean,
  chatId: string | undefined,
  opts: VnSyncOptions = {},
): void {
  const renderer = opts.renderer ?? { init: initVnRenderer, destroy: destroyVnRenderer, };
  const config = gmConfig ? jsonParseOr<GmConfig>(gmConfig, {},) : {};
  const enabled = config.renderingOverride != null
    ? config.renderingOverride === "visual_novel"
    : (vnEnabled || (config.visualNovel ?? false));

  const container = document.querySelector<HTMLElement>("#vn-container",);

  if (!enabled || !container) {
    renderer.destroy();
    syncSceneId(container, undefined,);
    container?.replaceChildren();
    return;
  }

  const vnMessages = Array.from(messages, (m,) => toVnMessage(m,),);
  if (vnMessages.length === 0) {
    renderer.destroy();
    return;
  }

  syncSceneId(container, chatId,);
  renderer.init(container, vnMessages, config as Record<string, unknown>, chatId, opts.worldId,);
}

/**
 * VN QA actions spread into the chat-settings Alpine scope: runs the QA
 * validator over the currently rendered scenes and mounts the report into
 * the modal's `[data-testid="vn-qa-report"]` container. Transient state —
 * `saveChatSettings` picks persisted fields explicitly, so nothing leaks
 * into gm_config.
 */
export const vnQaActions = {
  _vnQaReport: null as VnQaReport | null,
  _vnQaError: "",

  /** Validate the live scene list and render the report when a container exists. */
  runVnQaCheck(): void {
    const scenes = getVnScenes();
    this._vnQaError = "";

    if (scenes.length === 0) {
      this._vnQaReport = null;
      this._vnQaError = "No VN scenes rendered yet — enable Visual Novel Mode with at least one message first.";
      return;
    }

    this._vnQaReport = runQaCheck(scenes.map((scene,) => ({
      text: scene.text,
      characterName: scene.characterName,
      backgroundUrl: scene.backgroundUrl,
      role: scene.role,
    })),);

    const container = document.querySelector<HTMLElement>('[data-testid="vn-qa-report"]',);
    if (container && this._vnQaReport) {
      renderQaReport(this._vnQaReport, container,);
    }
  },
};
