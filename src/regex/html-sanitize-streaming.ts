// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Streaming HTML sanitizer — buffers across input chunks so a dangerous
 * tag split across two chunks (e.g. `<script>alert(1)` in chunk N and
 * `</script>` in chunk N+1) cannot slip through the standard
 * `sanitizeHtml` pipeline (which only strips a script tag once both
 * `<script>` and `</script>` have appeared in the same input).
 *
 * The sanitizer is stateful: callers create one per stream and feed it
 * the FULL accumulated rendered HTML on every chunk. The function
 * returns the cumulative-safe prefix — everything up to (but not
 * including) the leftmost unclosed paired dangerous opener. Anything
 * from that opener onward is held back until the next chunk closes
 * the boundary.
 *
 * BUG-redos-in-html-sanitize-script-tag-pattern-chunk-boundary-san:
 * the previous per-chunk `sanitizeHtml()` applied in `renderStreamMessage`
 * let a `<script>...</script>` split across SSE chunks pass through
 * unsanitized. This streaming sanitizer closes that gap.
 *
 * Self-closing dangerous tags (`<base href="...">`, `<embed ... />`)
 * are handled atomically by `DANGEROUS_TAGS` in the standard pipeline
 * and don't need streaming tracking.
 *
 * @module regex/html-sanitize-streaming
 */

import { sanitizeHtml, } from "./html-sanitize";

/**
 * Names of paired dangerous HTML tags whose contents could execute or
 * render unsafe resources if the closing tag hasn't arrived yet.
 */
const DANGEROUS_PAIRED_TAG_NAMES = [
  "script",
  "iframe",
  "object",
  "embed",
  "style",
  "form",
  "button",
  "svg",
  "math",
] as const;

const DANGEROUS_PAIRED_TAG_SET: ReadonlySet<string> = new Set(DANGEROUS_PAIRED_TAG_NAMES,);

/**
 * Find the leftmost position in `html` (from `fromIndex`) where a
 * paired dangerous tag is still open — i.e. a `<name>` (or `<name `)
 * has appeared but no matching `</name>` has been seen yet. Returns
 * `html.length` if no dangerous tag is unclosed in the scan window.
 *
 * Performs a single left-to-right character scan. Linear in
 * `html.length`. Safe on adversarial input like `"<script".repeat(40_000)`
 * (no `>`) — the scan visits each char once, since the inner `<`-search
 * doesn't re-scan the suffix when a dangerous opener has no terminator
 * (we advance past the tag name and let the outer loop pick up the next
 * `<`).
 *
 * The function is case-insensitive on tag names and respects quoted
 * attribute values when looking for the `>` terminator. A dangerous
 * opener without a `>` (chunk split mid-tag) is treated as still
 * open — that's exactly the XSS boundary case.
 * @param html
 * @param fromIndex
 */
function findEarliestUnclosedDangerousOpen(html: string, fromIndex: number,): number {
  const lower = html.toLowerCase();
  const open = new Set<string>();
  let leftmostOpen = lower.length;
  let i = fromIndex;
  const n = lower.length;
  const isTagNameChar = (c: string | undefined,): boolean => c !== undefined && /[\w-]/.test(c,);
  while (i < n) {
    if (lower[i] !== "<") {
      i++;
      continue;
    }
    const lt = i;
    if (i + 1 < n && lower[i + 1] === "/") {
      // Closing tag `</name>`. Find `>` linearly.
      let gt = -1;
      for (let k = i + 2; k < n; k++) {
        if (lower[k] === ">") {
          gt = k;
          break;
        }
      }
      const nameEnd = gt === -1 ? n : gt;
      const name = lower.slice(i + 2, nameEnd,).trim();
      open.delete(name,);
      i = gt === -1 ? n : gt + 1;
      continue;
    }
    // Open tag: read name (stop at whitespace, `>`, `/`, `<`, or end).
    let nameEndIdx = lt + 1;
    while (nameEndIdx < n && isTagNameChar(lower[nameEndIdx],)) { nameEndIdx++; }
    const name = lower.slice(lt + 1, nameEndIdx,);
    if (!DANGEROUS_PAIRED_TAG_SET.has(name,)) {
      // Non-dangerous tag — find its terminator `>` (respecting quotes)
      // so the scanner advances past it.
      let gtIdx = -1;
      let inQuote: string | null = null;
      for (let k = nameEndIdx; k < n; k++) {
        const c = lower[k] ?? "";
        if (inQuote) {
          if (c === inQuote) { inQuote = null; }
          continue;
        }
        if (c === '"' || c === "'") {
          inQuote = c;
          continue;
        }
        if (c === ">") {
          gtIdx = k;
          break;
        }
      }
      i = gtIdx === -1 ? n : gtIdx + 1;
      continue;
    }
    // Dangerous open tag. Record `lt` as the leftmost open position
    // (no earlier open dangerous tag exists because we scan left-to-
    // right), then advance past the tag name. We'll keep scanning
    // for further `<` characters; if a matching `</name>` arrives we
    // close the tag and clear it from the open set. If a new dangerous
    // opener arrives, `leftmostOpen` stays pinned to the first one.
    if (lt < leftmostOpen) { leftmostOpen = lt; }
    open.add(name,);
    i = nameEndIdx;
  }
  // If any dangerous tag is still open at end-of-input, the suffix is
  // potentially inside it. Return leftmostOpen as the safe boundary.
  return open.size === 0 ? lower.length : leftmostOpen;
}

/**
 * Build a stateful HTML sanitizer that buffers across input chunks.
 *
 * Each call receives the FULL accumulated rendered HTML. The sanitizer
 * runs the standard sanitize pipeline, identifies the leftmost unclosed
 * paired dangerous tag, and returns the full sanitized prefix up to
 * (but not including) that tag — i.e. everything provably safe to emit
 * right now. Anything from the leftmost unclosed dangerous opener
 * onward is held back until the next chunk closes the boundary.
 *
 * @returns A function that consumes the full accumulated rendered HTML
 *   and returns the safe cumulative prefix.
 */
export function createStreamingSanitizer(): (accumulated: string,) => string {
  let emittedEnd = 0;
  return (accumulated: string,) => {
    const sanitized = sanitizeHtml(accumulated,);
    if (emittedEnd > sanitized.length) {
      // Caller rewound/reset the buffer (e.g. abort + restart); start fresh.
      emittedEnd = 0;
    }
    const heldFrom = findEarliestUnclosedDangerousOpen(sanitized, emittedEnd,);
    emittedEnd = heldFrom;
    return sanitized.slice(0, heldFrom,);
  };
}
