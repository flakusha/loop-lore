// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN (visual novel) renderer wiring for the chat page.
 *
 * Maps chat messages to the VN renderer's message shape and syncs the renderer
 * with the persisted gm_config. Extracted so `chat-settings.ts` stays under the
 * 250L file-size guard.
 */

import { destroyVnRenderer, initVnRenderer, type VnMessage, } from "../../vn";
import { jsonParseOr, } from "../json";
import type { GmConfig, Message, } from "../types";

/**
 * Map a chat-page message to the VN renderer's message shape.
 * @param m
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
 * (Re)render the active chat as a VN scene when VN mode is enabled, or tear the
 * renderer down when it is disabled. Reads the persisted gm_config so the
 * renderer and the settings modal stay in sync.
 * @param messages
 * @param gmConfig
 * @param vnEnabled
 * @param chatId
 */
export function syncVnRenderer(
  messages: Message[],
  gmConfig: string | null | undefined,
  vnEnabled: boolean,
  chatId: string | undefined,
): void {
  const config = gmConfig ? jsonParseOr<GmConfig>(gmConfig, {},) : {};
  const enabled = config.visualNovel ?? vnEnabled;
  const container = document.querySelector<HTMLElement>("#vn-container",);

  if (!enabled || !container) {
    destroyVnRenderer();
    container?.replaceChildren();
    return;
  }

  const vnMessages = Array.from(messages, (m,) => toVnMessage(m,),);
  if (vnMessages.length === 0) {
    destroyVnRenderer();
    return;
  }
  initVnRenderer(container, vnMessages, config as Record<string, unknown>, chatId,);
}
