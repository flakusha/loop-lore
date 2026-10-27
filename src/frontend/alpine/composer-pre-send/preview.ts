// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared markdown-preview primitive (composer-pre-send) — framework-
 * agnostic, importable by any text surface needing sanitized preview
 * rendering or the stream-preference keys.
 */
import { chatUtilsRender, } from "../chat-utils/render";
import { STREAM_PREF_KEY, } from "./constants";

/** Minimal DOMPurify surface the preview renderer accepts. */
export interface PreviewSanitizer {
  sanitize(html: string,): string;
}

const getPreviewSanitizer = () => (globalThis as unknown as { __DOMPurify?: PreviewSanitizer }).__DOMPurify;

/** Markdown renderer installed app-wide by `src/frontend/chat-vendor.ts`. */
const getMarked = () => globalThis.__marked;

/**
 * Storage key for the stream preference; per-chat, global when no chatId.
 * @param {string | null} chatId
 * @returns {string}
 */
export function streamPrefKey(chatId?: string | null,): string {
  return chatId ? `${STREAM_PREF_KEY}:${chatId}` : STREAM_PREF_KEY;
}

/**
 * Read the stream preference; on by default, explicit `"false"` opts out.
 * @param {Storage | null} storage
 * @param {string | null} chatId
 * @returns {boolean}
 */
export function readStreamPreference(storage: Storage | null, chatId?: string | null,): boolean {
  if (!storage) { return true; }
  const perChat = chatId ? storage.getItem(streamPrefKey(chatId,),) : null;
  const raw = perChat ?? storage.getItem(STREAM_PREF_KEY,);
  return raw !== "false";
}

/**
 * Persist the stream preference for a chat (globally when no chatId).
 * @param {Storage | null} storage
 * @param {string | null | undefined} chatId
 * @param {boolean} value
 * @returns {void}
 */
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

/**
 * True for the Ctrl+Shift+P preview-toggle chord (either shift state of P).
 * @param {Pick<KeyboardEvent, "ctrlKey" | "shiftKey" | "key">} event
 * @returns {boolean}
 */
export function isPreviewToggleEvent(event: Pick<KeyboardEvent, "ctrlKey" | "shiftKey" | "key">,): boolean {
  if (!event.ctrlKey || !event.shiftKey) { return false; }
  return event.key === "P" || event.key === "p";
}

/**
 * Render raw composer text as preview HTML.
 *
 * Uses the SHARED renderer (`chat-utils/render`) so markdown and
 * `:shortcode:` expansion match every other render surface. Falls back to the
 * sanitiser-only path when the markdown library is missing, and to the raw
 * text when no sanitizer global is present — the template must render it via
 * `textContent` in that case, never `innerHTML`.
 * @param {string} raw
 * @returns {string}
 */
export function renderPreviewHtml(raw: string,): string {
  const purify = getPreviewSanitizer();
  if (!purify) { return raw; }
  if (!getMarked()) { return purify.sanitize(raw,); }
  return chatUtilsRender.renderMarkdown?.(raw,) ?? purify.sanitize(raw,);
}
