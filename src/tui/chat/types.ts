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
  /** Fired after a successful `/image` or `/upload` flow so the host can
   * reload the asset sidebar — the widget holds no sidebar reference. */
  onAssetsRefresh?: () => void;
  /** Link an uploaded asset to the active chat. Wired by the host to the
   * sidebar's `attachAsset`; absent in tests that build the widget bare,
   * where the upload flow reports the id and skips the link step. */
  linkAsset?: (assetId: string,) => Promise<boolean>;
  /** Overrides the send-message timeout; defaults to `TUI_DEFAULTS.sendTimeoutMs`. */
  sendTimeoutMs?: number;
  /**
   * Reports whether a full-screen overlay (chat picker, harness, models)
   * owns the keyboard. While true the widget's screen-level keys (Tab)
   * must not fire, or focus jumps into a hidden element.
   */
  isOverlayOpen?: () => boolean;
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
  isSending: boolean;
  sessionToken: string | undefined;
  /** Send-message timeout in ms; covers one full assistant generation. */
  sendTimeoutMs: number;
  addMessage(message: ChatMessage,): void;
  /** Replace the rendered transcript; the list and its row counter are the
   * widget's to keep in step, so the dispatcher hands the page over whole. */
  setMessages(messages: ChatMessage[],): void;
  scrollToBottom(): void;
  showTyping(): void;
  hideTyping(): void;
  showError(message: string,): void;
}
