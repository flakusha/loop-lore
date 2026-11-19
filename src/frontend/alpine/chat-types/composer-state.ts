// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { DraftStore, } from "../chat-drafts";

/** Composer send path and session-level draft cache. */
export interface ChatCoreComposerState {
  _draftTimer: ReturnType<typeof setTimeout> | null;
  /** Last non-empty draft before clear — session-level Ctrl+Z undo. */
  _draftBackup: string | undefined;
  /** Sent composer lines per chat, oldest first. */
  _composerHistory: Map<string, string[]>;
  /** Chat the cursor below belongs to; reset when activeChat changes. */
  _composerHistoryChat: string | null;
  /** Index into the active chat's history; length === empty draft. */
  _composerHistoryCursor: number;
  sendMessage(): Promise<void>;
  interceptSlashSend(text: string, input: HTMLTextAreaElement,): Promise<boolean>;
  saveComposerDraft(store?: DraftStore,): void;
  flushComposerDraft(store?: DraftStore,): void;
  restoreComposerDraft(store?: DraftStore,): void;
  clearComposerDraft(store?: DraftStore,): void;
  autoResize(el: HTMLTextAreaElement,): void;
}
