// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { MessageAttachment, } from "../../alpine/chat-types";
import type { SpriteRosterEntry, } from "../sprite-stage";
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
  /** Full cast for multi-sprite staging; defaults to the single speaker. */
  cast?: SpriteRosterEntry[];
  /** Speaking member key; null dims the whole stage (narration). */
  speakerId?: string | null;
  /** Emotion key for variant resolution. */
  emotion?: string;
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
  /** Full cast for multi-sprite staging. */
  cast?: SpriteRosterEntry[];
  /** Speaking member key; null dims the whole stage (narration). */
  speakerId?: string | null;
  /** Emotion key for variant resolution. */
  emotion?: string;
  attachments?: MessageAttachment[];
}
