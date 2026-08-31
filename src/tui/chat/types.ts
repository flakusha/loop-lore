// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type blessed from "blessed";

/** */
export interface ChatMessage {
  id: string;
  role: string;
  content: string;
  actorName?: string;
}

/** */
export interface ChatWidgetOptions {
  sessionToken?: string;
  onChatChange?: (chatId: string,) => void;
}

/**
 * Handle for the widget's runtime state + UI callbacks, threaded into the
 * dispatcher modules (display / api) instead of relying on `this`.
 */
export interface ChatHost {
  screen: blessed.Widgets.Screen;
  messageList: blessed.Widgets.ListElement;
  chatId: string | null;
  messages: ChatMessage[];
  itemCount: number;
  isSending: boolean;
  sessionToken: string | undefined;
  cursor: string | null; // pagination cursor
  addMessage(message: ChatMessage,): void;
  scrollToBottom(): void;
  showTyping(): void;
  hideTyping(): void;
  showError(message: string,): void;
}
