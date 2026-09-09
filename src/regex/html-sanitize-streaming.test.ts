// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import {
  createStreamingSanitizer,
  DANGEROUS_TAGS,
  JS_URL_ATTR,
  ON_EVENT_DOUBLE,
  ON_EVENT_SINGLE,
  ON_EVENT_UNQUOTED,
  stripScriptTags,
} from "./html-sanitize";

/**
 * Streaming sanitizer — holds back a dangerous tag split across two
 * chunks (e.g. `<script>alert(1)` in chunk N, `</script>` in chunk N+1)
 * so the standard sanitizeHtml pipeline doesn't ship the unsanitized
 * payload to the SSE buffer between chunks.
 *
 * Regression coverage for BUG-redos-in-html-sanitize-script-tag-pattern-
 * chunk-boundary-san.
 */
describe("createStreamingSanitizer", () => {
  // Helper: a "single-shot" sanitizer mirrors the previous per-chunk
  // sanitizeHtml call so we can contrast the two behaviors in regression
  // tests. The bug was that the per-chunk call left the dangerous tail
  // (chunk N's `<script>alert(1)` without the closing tag) in the
  // emitted bubble until chunk N+1 arrived — by which point the prior
  // bubble had already shipped the unsanitized payload to the SSE buffer
  // and (via DOMPurify fail-safe or naive replay) into the DOM.
  const perChunkSanitize = (html: string,) =>
    stripScriptTags(html,)
      .replaceAll(ON_EVENT_DOUBLE, "",)
      .replaceAll(ON_EVENT_SINGLE, "",)
      .replaceAll(ON_EVENT_UNQUOTED, "",)
      .replaceAll(JS_URL_ATTR, "",)
      .replaceAll(DANGEROUS_TAGS, "",);

  test("emits empty for empty input", () => {
    const sanitize = createStreamingSanitizer();
    expect(sanitize("",),).toBe("",);
  });

  test("passes safe content through unchanged", () => {
    const sanitize = createStreamingSanitizer();
    expect(sanitize("<p>Hello world</p>",),).toBe("<p>Hello world</p>",);
  });

  test("monotonic growth across safe chunks", () => {
    const sanitize = createStreamingSanitizer();
    expect(sanitize("<p>Hello",),).toBe("<p>Hello",);
    expect(sanitize("<p>Hello world",),).toBe("<p>Hello world",);
    expect(sanitize("<p>Hello world!</p>",),).toBe("<p>Hello world!</p>",);
  });

  test("holds back unclosed-tag tail until next chunk closes boundary", () => {
    // The exact XSS vector from BUG-redos-in-html-sanitize-script-tag-
    // pattern-chunk-boundary-san: chunk 1 ends mid-`<script>` tag, chunk 2
    // supplies the closing tag plus the trailing content. Without the
    // streaming sanitizer the per-chunk pipeline emits chunk 1's raw
    // `<script>alert(1)` to the SSE buffer — DOMPurify strips it client
    // side, but defense-in-depth at the server must also hold it back.
    const sanitize = createStreamingSanitizer();
    // Chunk 1: dangerous opener is still open in the sanitized output.
    const emit1 = sanitize("<p>safe</p><script>alert(1)",);
    // Held-back tail must NOT include `<script` or `alert(1)`.
    expect(emit1,).toBe("<p>safe</p>",);
    expect(emit1,).not.toContain("<script",);
    expect(emit1,).not.toContain("alert(1)",);
    // Chunk 2 closes the script tag and adds trailing content. The
    // sanitizer returns the full cumulative safe content (caller emits
    // the bubble body from this; client replaces prior bubble).
    const emit2 = sanitize("<p>safe</p><script>alert(1)</script>hello",);
    expect(emit2,).toBe("<p>safe</p>hello",);
  });

  test("demonstrates the per-chunk bug it replaces", () => {
    // Contrast: the per-chunk pipeline lets chunk 1's payload through
    // unsanitized because the closing tag hasn't arrived yet. This
    // test pins the bug so a regression to the old code path is caught.
    const chunk1Html = "<p>safe</p><script>alert(1)";
    expect(perChunkSanitize(chunk1Html,),).toBe("<p>safe</p><script>alert(1)",);
    expect(perChunkSanitize(chunk1Html,),).toContain("<script",);
  });

  test("handles multiple unclosed tags across chunks", () => {
    const sanitize = createStreamingSanitizer();
    // First chunk: opens `<p>` and `<img>` with a stripped `onerror`
    // (harmless — neither is a paired dangerous tag).
    const emit1 = sanitize('<p>a<img src="x" onerror=alert(1)',);
    // Nothing dangerous is open in the sanitized output; full content
    // is safe to emit.
    expect(emit1,).toBe('<p>a<img src="x" ',);
    expect(emit1,).not.toContain("onerror",);
    // Second chunk: still no dangerous opener, just an unclosed `<b>`
    // (also harmless). Full sanitized content is safe to emit.
    const emit2 = sanitize('<p>a<img src="x" onerror=alert(1)><b>bold',);
    expect(emit2,).toBe('<p>a<img src="x" ><b>bold',);
    // Third chunk closes the `<b>` — full content safe.
    const emit3 = sanitize('<p>a<img src="x" onerror=alert(1)><b>bold</b>',);
    expect(emit3,).toBe('<p>a<img src="x" ><b>bold</b>',);
  });

  test("emits full sanitized content when no `<` is present", () => {
    const sanitize = createStreamingSanitizer();
    expect(sanitize("hello",),).toBe("hello",);
    expect(sanitize("hello world",),).toBe("hello world",);
    expect(sanitize("hello world!",),).toBe("hello world!",);
  });

  test("survives a caller-side reset (accumulated shorter than emittedEnd)", () => {
    const sanitize = createStreamingSanitizer();
    sanitize("<p>keep this content here</p>",);
    // Caller drops the prior buffer and starts fresh with shorter input.
    // The sanitizer must not throw on `slice(emittedEnd)` where emittedEnd
    // exceeds the new input length.
    expect(sanitize("<p>fresh",),).toBe("<p>fresh",);
  });

  test("streaming sanitizer completes in linear time on adversarial input", () => {
    // Many `<script` prefixes with no closing tag should not backtrack
    // exponentially. The per-chunk `stripScriptTags` is already linear
    // (verified by the `handles many unterminated <script prefixes`
    // test), and the streaming sanitizer's tracker must stay linear too.
    const sanitize = createStreamingSanitizer();
    const input = "<script".repeat(40_000,);
    const start = performance.now();
    const emit = sanitize(input,);
    const elapsed = performance.now() - start;
    expect(elapsed,).toBeLessThan(200,);
    // The first `<script` is held back because it's potentially the
    // start of a dangerous tag whose close hasn't arrived yet, so the
    // emitted content is empty.
    expect(emit,).toBe("",);
  });
});
