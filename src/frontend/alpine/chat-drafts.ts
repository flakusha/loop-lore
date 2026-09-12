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
 */

import { jsonParseOr, safeJsonStringify, } from "./json";
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

/** Minimal storage surface so tests can inject an in-memory fake. */
export interface DraftStore {
  getItem(key: string,): string | null;
  setItem(key: string, value: string,): void;
  removeItem(key: string,): void;
}

/** Draft payload. */
export interface ComposerDraft {
  text: string;
  savedAt: string;
}

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
  const raw = store.getItem(DRAFT_INDEX_KEY,);
  if (!raw) { return []; }
  const parsed = jsonParseOr<unknown>(raw, [],);
  if (!Array.isArray(parsed,)) { return []; }
  return parsed.filter((id,): id is string => typeof id === "string");
}

/**
 * @param store
 * @param chatId
 * @returns The stored draft, or null when absent or malformed.
 */
export function readDraft(store: DraftStore, chatId: string,): ComposerDraft | null {
  const raw = store.getItem(draftKey(chatId,),);
  if (!raw) { return null; }
  const parsed = jsonParseOr<unknown>(raw, null,);
  if (typeof parsed !== "object" || parsed === null) { return null; }
  const text = (parsed as Record<string, unknown>).text;
  if (typeof text !== "string" || text === "") { return null; }
  return { text, savedAt: new Date().toISOString(), };
}

/**
 * Persist one draft; blank text removes it. Quota errors drop the write
 * rather than breaking the composer.
 * @param store
 * @param chatId
 * @param text
 */
export function writeDraft(store: DraftStore, chatId: string, text: string,): void {
  const trimmed = text.slice(0, DRAFT_MAX_CHARS,);
  if (trimmed === "") {
    clearDraft(store, chatId,);
    return;
  }
  const payload = safeJsonStringify({ text: trimmed, savedAt: new Date().toISOString(), },);
  if (!payload.ok) { return; }
  try {
    store.setItem(draftKey(chatId,), payload.value,);
  } catch {
    return;
  }
  const index = readDraftIndex(store,).filter((id,) => id !== chatId);
  index.unshift(chatId,);
  for (const evicted of index.slice(DRAFT_MAX_CHATS,)) {
    try {
      store.removeItem(draftKey(evicted,),);
    } catch {
      /* keep evicting the rest */
    }
  }
  const encoded = safeJsonStringify(index.slice(0, DRAFT_MAX_CHATS,),);
  if (!encoded.ok) { return; }
  try {
    store.setItem(DRAFT_INDEX_KEY, encoded.value,);
  } catch {
    /* index loss only forfeits LRU order */
  }
}

/**
 * @param store
 * @param chatId
 */
export function clearDraft(store: DraftStore, chatId: string,): void {
  try {
    store.removeItem(draftKey(chatId,),);
  } catch {
    return;
  }
  try {
    const index = readDraftIndex(store,).filter((id,) => id !== chatId);
    const encoded = safeJsonStringify(index,);
    if (encoded.ok) { store.setItem(DRAFT_INDEX_KEY, encoded.value,); }
  } catch {
    /* index loss only forfeits LRU order */
  }
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
    clearDraft(target, this.activeChat,);
  },
};
