// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Composer history — per-chat recall of previously sent lines.
 *
 * Extracted from chat-send.ts (push on send) and chat-group.ts (arrow recall)
 * so both files stay inside the per-file size budget; behaviour is unchanged.
 */

import type { ChatState, } from "./types";

/** Max recalled composer lines kept per chat; oldest entry dropped first. */
const COMPOSER_HISTORY_LIMIT = 20;

/**
 * Remember a sent line for per-chat Up/Down recall; empty text is ignored.
 * @param ctx - composer state
 * @param text - sent line
 */
export function rememberComposerText(ctx: ChatState, text: string,): void {
  const chatId = ctx.activeChat;

  if (!text || !chatId) { return; }
  let history = ctx._composerHistory.get(chatId,);
  if (!history) {
    history = [];
    ctx._composerHistory.set(chatId, history,);
  }

  history.push(text,);
  if (history.length > COMPOSER_HISTORY_LIMIT) { history.shift(); }
  ctx._composerHistoryChat = chatId;
  ctx._composerHistoryCursor = history.length;
}

/**
 * Walk the active chat's recalled lines; cursor === history.length is the
 * empty-draft position, so ArrowDown ends there rather than wrapping.
 * @param ctx - composer state
 * @param input - composer textarea
 * @param direction - -1 for older, 1 for newer
 */
export function recallComposerHistory(
  ctx: ChatState,
  input: HTMLTextAreaElement,
  direction: 1 | -1,
): void {
  const chatId = ctx.activeChat;

  if (!chatId) { return; }
  const history = ctx._composerHistory.get(chatId,) ?? [];
  if (ctx._composerHistoryChat !== chatId) {
    ctx._composerHistoryChat = chatId;
    ctx._composerHistoryCursor = history.length;
  }

  const cursor = Math.min(ctx._composerHistoryCursor, history.length,);
  if ((direction < 0 && cursor === 0) || (direction > 0 && cursor >= history.length)) { return; }
  const next = cursor + direction;

  ctx._composerHistoryCursor = next;
  if (direction < 0) {
    input.value = history[next] ?? "";
  } else {
    input.value = next === history.length ? "" : history[next] ?? "";
  }

  ctx.autoResize(input,);
  ctx.saveComposerDraft();
}
