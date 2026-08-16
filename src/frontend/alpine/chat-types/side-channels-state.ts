// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { AlpineMagicThis, } from "../types";

/** One side-channel row returned by GET /api/v1/chats/:id/side. */
export interface SideChannel {
  id: string;
  name: string;
  type: string;
  mode: string;
  created_by: string;
  world_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Side-channels methods (C1 — group-chat matrix UI remainder).
 *
 * Side-channels are child chats linked to a group chat via `parent_chat_id`
 * (with `template_id IS NULL`, distinguishing them from migrated chats). The
 * header dropdown lists them, creates new ones, and switches the active chat.
 *
 * Display state (open flag, list, new-name) lives on `$store.ui` because the
 * chat-header dropdown is outside the chatState x-data scope; methods here run
 * on the chatState instance to reach `this.activeChat`.
 */
export interface ChatSideChannelsState extends AlpineMagicThis {
  /** True when the active chat is a group chat. */
  readonly isGroupChat: boolean;

  /** Load side-channels for the active chat into `$store.ui.sideChannels`. */
  loadSideChannels(): Promise<void>;
  /** Create a side-channel linked to the active chat (POST /chats/:id/side). */
  createSideChannel(name: string,): Promise<void>;
  /** Switch the active chat to a side-channel (reuse selectChat). */
  switchSideChannel(chatId: string,): Promise<void>;
  /** Toggle the dropdown (`$store.ui.showSideChannels`). */
  toggleSideChannels(): void;
}
