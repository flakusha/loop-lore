// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { MessageAttachment, } from "../../alpine/chat-types";
import type { TransitionType, } from "../transition-engine";

/** A single VN scene derived from one or more messages. */
export interface VnScene {
  messageId: string;
  backgroundUrl?: string;
  characterName: string;
  characterAvatar?: string;
  text: string;
  thinking?: string;
  role: "assistant" | "user" | "system" | "narration";
  transition?: TransitionType;
  attachments?: MessageAttachment[];
}

/** Message shape expected by the renderer. */
export interface VnMessage {
  id: string;
  role: "assistant" | "user" | "system" | "narration";
  name?: string;
  content: string;
  thinking?: string;
  avatar_asset_id?: string;
  background_url?: string;
  attachments?: MessageAttachment[];
}
