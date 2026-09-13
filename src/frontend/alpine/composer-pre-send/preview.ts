// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { STREAM_PREF_KEY, } from "./constants";

/** Minimal DOMPurify surface the preview renderer accepts. */
export interface PreviewSanitizer {
  sanitize(html: string,): string;
}

const getPreviewSanitizer = () => (globalThis as unknown as { __DOMPurify?: PreviewSanitizer }).__DOMPurify;

/** Storage key for the stream preference; per-chat, global when no chatId. */
export function streamPrefKey(chatId?: string | null,): string {
  return chatId ? `${STREAM_PREF_KEY}:${chatId}` : STREAM_PREF_KEY;
}

/** Read the stream preference; on by default, explicit `"false"` opts out. */
export function readStreamPreference(storage: Storage | null, chatId?: string | null,): boolean {
  if (!storage) { return true; }
  const perChat = chatId ? storage.getItem(streamPrefKey(chatId,),) : null;
  const raw = perChat ?? storage.getItem(STREAM_PREF_KEY,);
  return raw !== "false";
}

/** Persist the stream preference for a chat (globally when no chatId). */
export function writeStreamPreference(
  storage: Storage | null,
  chatId: string | null | undefined,
  value: boolean,
): void {
  if (!storage) { return; }
  try {
    storage.setItem(streamPrefKey(chatId,), value ? "true" : "false",);
  } catch {
    /* best-effort: storage full or blocked */
  }
}

/** True for the Ctrl+Shift+P preview-toggle chord (either shift state of P). */
export function isPreviewToggleEvent(event: Pick<KeyboardEvent, "ctrlKey" | "shiftKey" | "key">,): boolean {
  if (!event.ctrlKey || !event.shiftKey) { return false; }
  return event.key === "P" || event.key === "p";
}

/**
 * Sanitize raw composer text for preview. Falls back to the raw text when
 * no sanitizer global is present — the template must render it via
 * `textContent` in that case, never `innerHTML`.
 */
export function renderPreviewHtml(raw: string,): string {
  const purify = getPreviewSanitizer();
  if (purify) { return purify.sanitize(raw,); }
  return raw;
}
