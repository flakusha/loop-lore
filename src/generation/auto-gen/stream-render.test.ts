// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { createStreamingSanitizer, } from "../../regex/html-sanitize";
import {
  renderStreamMessage,
  renderStreamMessageWithSanitizer,
} from "./stream-render";

// Minimal markdown stub: passes through raw HTML (like marked's default),
// wraps plain text in `<p>...</p>`. The renderer's sanitize step is
// what we're exercising — markdown fidelity is not the point.
const markedParse = (s: string,): string => {
  if (s.includes("<",)) { return s; }
  if (s.trim() === "") { return ""; }
  return `<p>${s}</p>`;
};

const includes = (haystack: string, needle: string,): boolean => haystack.includes(needle,);

describe("renderStreamMessageWithSanitizer", () => {
  test("emits a bubble with the safe cumulative content", () => {
    const sanitizer = createStreamingSanitizer();
    const html = renderStreamMessageWithSanitizer(
      "Alice",
      "<p>Hello world</p>",
      "attempt-1",
      markedParse,
      sanitizer,
    );
    expect(includes(html, "<p>Hello world</p>",),).toBe(true,);
    expect(includes(html, 'data-message-id="attempt-1"',),).toBe(true,);
    expect(includes(html, 'data-streaming="true"',),).toBe(true,);
  });

  test("holds back dangerous payload across chunk boundaries (XSS regression)", () => {
    // The exact XSS vector from
    // BUG-redos-in-html-sanitize-script-tag-pattern-chunk-boundary-san:
    // chunk N ends mid-`<script>` tag, chunk N+1 brings the closing tag.
    // The bubble emitted for chunk N must NOT contain `<script` or
    // `alert(1)` — even though the markdown parser hasn't yet seen the
    // closing tag.
    const sanitizer = createStreamingSanitizer();
    const chunk1Html = renderStreamMessageWithSanitizer(
      "Mallory",
      "<p>safe</p><script>alert(1)",
      "attempt-2",
      markedParse,
      sanitizer,
    );
    expect(includes(chunk1Html, "<script",),).toBe(false,);
    expect(includes(chunk1Html, "alert(1)",),).toBe(false,);
    expect(includes(chunk1Html, "<p>safe</p>",),).toBe(true,);
    // Chunk 2 closes the script tag and adds trailing content. The
    // sanitizer flushes the previously-held tail — now that the close
    // has arrived, the entire sanitized content is safe to emit.
    const chunk2Html = renderStreamMessageWithSanitizer(
      "Mallory",
      "<p>safe</p><script>alert(1)</script>after",
      "attempt-2",
      markedParse,
      sanitizer,
    );
    expect(includes(chunk2Html, "<script",),).toBe(false,);
    expect(includes(chunk2Html, "alert(1)",),).toBe(false,);
    expect(includes(chunk2Html, "after",),).toBe(true,);
  });

  test("final render emits full sanitized content with no held tail", () => {
    // After streaming completes, callers use `renderStreamMessage` (not
    // the sanitizer version) to emit the final bubble. The final bubble
    // must show the entire sanitized content with no held-back tail —
    // the response is complete, so any cross-chunk boundary that was
    // deferred is now closed.
    const sanitizer = createStreamingSanitizer();
    renderStreamMessageWithSanitizer(
      "Bob",
      "<p>part1</p><script>alert(1)",
      "attempt-3",
      markedParse,
      sanitizer,
    );
    const finalHtml = renderStreamMessage(
      "Bob",
      "<p>part1</p><script>alert(1)</script>part2",
      "attempt-3",
      markedParse,
      { isFinal: true, },
    );
    expect(includes(finalHtml, "<script",),).toBe(false,);
    expect(includes(finalHtml, "alert(1)",),).toBe(false,);
    expect(includes(finalHtml, "<p>part1</p>",),).toBe(true,);
    expect(includes(finalHtml, "part2",),).toBe(true,);
    expect(includes(finalHtml, 'class="actions"',),).toBe(true,);
    expect(includes(finalHtml, 'data-streaming="true"',),).toBe(false,);
  });

  test("thinking block is sanitized", () => {
    const sanitizer = createStreamingSanitizer();
    const html = renderStreamMessageWithSanitizer(
      "Carol",
      "<p>main</p>",
      "attempt-4",
      markedParse,
      sanitizer,
      { thinking: "<script>leak()</script>thoughts", },
    );
    expect(includes(html, "<script",),).toBe(false,);
    expect(includes(html, "thoughts",),).toBe(true,);
  });
});
