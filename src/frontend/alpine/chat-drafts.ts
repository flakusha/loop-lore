// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-chat composer draft persistence (local-first).
 *
 * The textarea keeps no memory across reloads or chat switches, so typed
 * text is snapshotted to localStorage per chat: debounced on `@input`,
 * flushed synchronously on chat switch, restored on select, cleared on
 * send. Server never sees pre-send text (drafts stay plaintext on device).
 *
 * Methods are merged into the chat state object at call time, so `this`
 * still resolves to the full ChatState.
 *
 * ponytail: local-only drafts, server sync if multi-device demand.
 */

import {
  type ComposerDraft,
  createKeyedDraftStore,
  type DraftStore,
  type KeyedDraftStore,
} from "./draft-store";
import type { ChatState, } from "./types";

/** Key prefix for per-chat drafts; the chat id is appended verbatim. */
const DRAFT_PREFIX = "loop-lore:composer-draft:";
/** MRU chat-id list bounding total stored drafts. */
const DRAFT_INDEX_KEY = "loop-lore:composer-drafts:index";
/** Keystroke → storage debounce window. */
export const DRAFT_DEBOUNCE_MS = 300;
/** Longest text kept per draft; longer input is truncated. */
export const DRAFT_MAX_CHARS = 10 * 1024;
/** Most chats with a retained draft; older entries are evicted. */
export const DRAFT_MAX_CHATS = 20;

export type { ComposerDraft, DraftStore, };

/**
 * @returns The ambient localStorage, or null outside a browser context.
 */
export function defaultDraftStore(): DraftStore | null {
  try {
    const ls = globalThis.localStorage;
    if (typeof ls === "undefined" || ls === null) { return null; }
    return ls;
  } catch {
    return null;
  }
}

// One factory instance per call keeps the historical signatures (storage is
// a parameter, not ambient state); the instance itself is stateless.
function chatDrafts(store: DraftStore,): KeyedDraftStore {
  return createKeyedDraftStore({
    prefix: DRAFT_PREFIX,
    indexKey: DRAFT_INDEX_KEY,
    maxChars: DRAFT_MAX_CHARS,
    maxEntries: DRAFT_MAX_CHATS,
    storage: store,
  },);
}

/**
 * @param chatId
 * @returns The storage key for one chat's draft.
 */
export function draftKey(chatId: string,): string {
  return `${DRAFT_PREFIX}${chatId}`;
}

/**
 * @param store
 * @returns MRU-first chat ids with a draft; empty on corrupt data.
 */
export function readDraftIndex(store: DraftStore,): string[] {
  return chatDrafts(store,).readIndex();
}

/**
 * @param store
 * @param chatId
 * @returns The stored draft, or null when absent or malformed.
 */
export function readDraft(store: DraftStore, chatId: string,): ComposerDraft | null {
  return chatDrafts(store,).read(chatId,);
}

/**
 * Persist one draft; blank text removes it. Quota errors drop the write
 * rather than breaking the composer.
 * @param store
 * @param chatId
 * @param text
 * @returns {void}
 */
export function writeDraft(store: DraftStore, chatId: string, text: string,): void {
  chatDrafts(store,).write(chatId, text,);
}

/**
 * @param store
 * @param chatId
 * @returns {void}
 */
export function clearDraft(store: DraftStore, chatId: string,): void {
  chatDrafts(store,).clear(chatId,);
}

export const chatDraftMethods: Partial<ChatState> & ThisType<ChatState> = {
  /**
   * Debounced keystroke entry point, wired to the textarea `@input`.
   * @param store
   */
  saveComposerDraft(store?: DraftStore,) {
    if (this._draftTimer) {
      clearTimeout(this._draftTimer,);
      this._draftTimer = null;
    }

    const target = store ?? defaultDraftStore();
    if (!this.activeChat || !target) { return; }
    const chatId = this.activeChat;
    const timer = setTimeout(() => {
      this._draftTimer = null;
      const input = this.$refs.messageInput as HTMLTextAreaElement | undefined;
      writeDraft(target, chatId, input?.value ?? "",);
    }, DRAFT_DEBOUNCE_MS,);

    // Never hold a test runner open for a UI debounce.
    const unref = (timer as unknown as { unref?: () => void }).unref;
    if (typeof unref === "function") { unref.call(timer,); }
    this._draftTimer = timer;
  },

  /**
   * Synchronous write of the current input; safe to call on chat switch.
   * @param store
   */
  flushComposerDraft(store?: DraftStore,) {
    if (this._draftTimer) {
      clearTimeout(this._draftTimer,);
      this._draftTimer = null;
    }

    if (!this.activeChat) { return; }
    const target = store ?? defaultDraftStore();
    if (!target) { return; }
    const input = this.$refs.messageInput as HTMLTextAreaElement | undefined;
    writeDraft(target, this.activeChat, input?.value ?? "",);
  },

  /**
   * Restore the active chat's draft into the textarea; clears when none.
   * @param store
   */
  restoreComposerDraft(store?: DraftStore,) {
    if (!this.activeChat) { return; }
    const target = store ?? defaultDraftStore();
    if (!target) { return; }
    const input = this.$refs.messageInput as HTMLTextAreaElement | undefined;
    if (!input) { return; }
    const draft = readDraft(target, this.activeChat,);
    // Programmatic sets never fire `@input`, so no spurious re-save.
    input.value = draft?.text ?? "";
    this.autoResize(input,);
  },

  /**
   * Drop the active chat's draft and cancel any pending debounced save.
   * @param store
   */
  clearComposerDraft(store?: DraftStore,) {
    if (this._draftTimer) {
      clearTimeout(this._draftTimer,);
      this._draftTimer = null;
    }

    if (!this.activeChat) { return; }
    const target = store ?? defaultDraftStore();
    if (!target) { return; }
    // Stash the last non-empty text for session-level Ctrl+Z undo.
    const input = this.$refs.messageInput as HTMLTextAreaElement | undefined;
    const text = input?.value.trim() ?? "";
    if (text) { this._draftBackup = text; }
    clearDraft(target, this.activeChat,);
  },
};
