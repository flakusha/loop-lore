// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { ON_EVENT_DOUBLE, ON_EVENT_SINGLE, SCRIPT_TAG, } from "../../regex/html-sanitize";

/**
 * @param str
 */
function escapeHtml(str: string,): string {
  return str
    .replaceAll("&", "&amp;",)
    .replaceAll("<", "&lt;",)
    .replaceAll(">", "&gt;",)
    .replaceAll('"', "&quot;",)
    .replaceAll("'", "&#039;",);
}

/**
 * @param html
 */
function sanitizeHtml(html: string,): string {
  return html
    .replaceAll(SCRIPT_TAG, "",)
    .replaceAll(ON_EVENT_DOUBLE, "",)
    .replaceAll(ON_EVENT_SINGLE, "",);
}

/**
 * @param actorName
 * @param content
 * @param attemptId
 * @param markedParse
 * @param opts
 * @param opts.messageId
 * @param opts.isFinal
 * @param opts.thinking
 */
export function renderStreamMessage(
  actorName: string,
  content: string,
  attemptId: string,
  markedParse: (s: string,) => string,
  opts?: { messageId?: string; isFinal?: boolean; thinking?: string },
): string {
  const safeName = escapeHtml(actorName,);
  const rendered = markedParse(content,);
  const safeContent = sanitizeHtml(rendered,);
  const streamingAttr = opts?.isFinal ? "" : ' data-streaming="true"';
  const msgId = opts?.messageId ?? attemptId;

  const thinkingBlock = opts?.thinking
    ? `<details class="thinking-block"><summary>Thinking process</summary><div class="thinking-content">${
      sanitizeHtml(markedParse(opts.thinking,),)
    }</div></details>`
    : "";

  const actionsHtml = opts?.isFinal
    ? `<div class="actions"><button class="btn-icon action-regenerate" title="Regenerate">♻</button></div>`
    : "";

  return `<div class="message assistant" data-message-id="${msgId}"${streamingAttr}><div class="bubble"><div class="meta"><span class="name">${safeName}</span><span class="time">just now</span></div>${thinkingBlock}<div class="content">${safeContent}</div>${actionsHtml}</div></div>`;
}
