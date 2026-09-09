import { sanitizeHtml, } from "../../regex/html-sanitize";
function escapeHtml(str: string,): string {
  return str
    .replaceAll("&", "&amp;",)
    .replaceAll("<", "&lt;",)
    .replaceAll(">", "&gt;",)
    .replaceAll('"', "&quot;",)
    .replaceAll("'", "&#039;",);
}

/**
 * Render the streaming bubble for one SSE chunk update.
 *
 * `content` is the FULL accumulated response text as of this chunk. The
 * `sanitizer` is a stateful streaming sanitizer (created once per stream
 * via {@link createStreamingSanitizer}) that tracks how much of the
 * sanitized accumulated HTML has been emitted so far and defers any tail
 * that might still be inside an unclosed tag until the next chunk closes
 * the boundary.
 *
 * The emitted bubble contains the FULL sanitized accumulated content
 * MINUS the held-back tail — i.e. monotonically growing. As new chunks
 * arrive, the bubble body grows; once streaming ends, the final render
 * emits the full sanitized content with no held tail (see {@link
 * renderStreamMessage}).
 *
 * BUG-redos-in-html-sanitize-script-tag-pattern-chunk-boundary-san:
 * the previous per-chunk `sanitizeHtml(rendered)` let a
 * `<script>...</script>` split across SSE chunks pass through
 * unsanitized (the close arrived in a later chunk, after the bubble had
 * already been emitted).
 * @param actorName
 * @param content  full accumulated response text
 * @param attemptId
 * @param markedParse
 * @param sanitizer  per-stream streaming sanitizer
 * @param opts
 * @param opts.messageId
 * @param opts.thinking
 */
export function renderStreamMessageWithSanitizer(
  actorName: string,
  content: string,
  attemptId: string,
  markedParse: (s: string,) => string,
  sanitizer: (accumulated: string,) => string,
  opts?: { messageId?: string; thinking?: string },
): string {
  const safeName = escapeHtml(actorName,);
  const rendered = markedParse(content,);
  const fullSanitized = sanitizeHtml(rendered,);
  // `sanitizer` returns the newly-safe prefix since the previous call —
  // i.e. everything in `fullSanitized` that the streaming sanitizer has
  // committed to safe. Any tail that might still be inside an unclosed
  // tag is held back until the next chunk.
  const safeIncrement = sanitizer(fullSanitized,);
  const streamingAttr = ' data-streaming="true"';
  const msgId = opts?.messageId ?? attemptId;

  const thinkingBlock = opts?.thinking
    ? `<details class="thinking-block"><summary>Thinking process</summary><div class="thinking-content">${
      sanitizeHtml(markedParse(opts.thinking,),)
    }</div></details>`
    : "";

  return `<div class="message assistant" data-message-id="${msgId}"${streamingAttr}><div class="bubble"><div class="meta"><span class="name">${safeName}</span><span class="time">just now</span></div>${thinkingBlock}<div class="content">${safeIncrement}</div></div></div>`;
}
/**
 * Render the final streaming bubble after the response is complete.
 *
 * Unlike {@link renderStreamMessageWithSanitizer}, this renders the
 * full sanitized content with no held-back tail — the response is
 * complete, so any cross-chunk boundary that was previously deferred
 * is now closed and the sanitized content is safe to emit end-to-end.
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
