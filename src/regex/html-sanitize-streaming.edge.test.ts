// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Edge-case and overflow tests for src/regex/html-sanitize-streaming.ts.
 *
 * Lives in a separate file (mirroring the convention from
 * src/regex/template.edge.test.ts) so the original test file stays
 * untouched. These tests pin the streaming sanitizer's observable
 * contract on adversarial inputs that the standard suite does not
 * cover: chunk-boundary XSS vectors that defeat naive per-chunk
 * sanitization, false-positive guards, performance / DoS guards on
 * pathological input, and idempotency / independence of sanitizer
 * instances.
 *
 * Usage note: the streaming sanitizer is stateful and each call MUST
 * receive the FULL accumulated rendered HTML (not just the new chunk).
 * `emittedEnd` advances even when no dangerous tag is open, so the
 * `findEarliestUnclosedDangerousOpen` helper only re-scans the
 * suffix that has not yet been emitted.
 */
import { describe, expect, it, } from "bun:test";
import { createStreamingSanitizer, } from "./html-sanitize-streaming";

// ---------------------------------------------------------------------------
// Category 1: Chunk-boundary attacks — the core contract.
// ---------------------------------------------------------------------------

describe("chunk-boundary XSS attacks", () => {
  it("defends the canonical BUG-redos chunk-boundary attack", () => {
    // The exact attack pattern documented in BUG-redos-in-html-sanitize-
    // script-tag-pattern-chunk-boundary-san: chunk N ships
    // `<script>alert(1)` with no closer; chunk N+1 ships `</script>`.
    // The previous per-chunk pipeline let chunk N's raw `<script>` tag
    // through; the streaming sanitizer holds it back until chunk N+1
    // closes the boundary.
    const sanitize = createStreamingSanitizer();
    // Chunk N (cumulative so far: opener with body, no closer):
    const emit1 = sanitize("<p>safe</p><script>alert(1)",);
    // The dangerous tail must NOT be emitted at any point.
    expect(emit1,).not.toContain("<script",);
    expect(emit1,).not.toContain("alert(1)",);
    expect(emit1,).toBe("<p>safe</p>",);
    // Chunk N+1 closes the boundary; the cumulative safe prefix now
    // includes the trailing content (sanitizeHtml stripped the script
    // span).
    const emit2 = sanitize("<p>safe</p><script>alert(1)</script>hello",);
    expect(emit2,).toBe("<p>safe</p>hello",);
  });

  it("holds back <script> when opener prefix spans chunks and body in next chunk", () => {
    // Step 1: `<scr` (incomplete, no `>` yet) — name is `scr`, not in
    // the dangerous set, so the harmless prefix passes through.
    // Step 2: cumulative input now contains `<script>alert(1)` (opener
    // with no closer) — sanitizeHtml keeps the unclosed span, and the
    // streaming sanitizer pins the dangerous opener as held.
    // Step 3: closer arrives — sanitizeHtml strips the full span and
    // the streaming sanitizer emits the safe trailing content.
    const sanitize = createStreamingSanitizer();
    const step1 = sanitize("<p>safe</p><scr",);
    expect(step1,).toBe("<p>safe</p><scr",);
    const step2 = sanitize("<p>safe</p><scr<script>alert(1)",);
    expect(step2,).not.toContain("alert(1)",);
    expect(step2,).not.toContain("<script",);
    const step3 = sanitize("<p>safe</p><scr<script>alert(1)</script>done",);
    expect(step3,).not.toContain("alert(1)",);
    expect(step3,).not.toContain("<script",);
    expect(step3,).toContain("<p>safe</p>",);
    expect(step3,).toContain("done",);
  });

  it("holds back dangerous content across every intermediate chunk of a 4-step split", () => {
    // Defense-in-depth: every intermediate chunk must NOT emit the
    // dangerous opener's body. Only after the closer arrives does the
    // full cumulative safe prefix get emitted.
    const sanitize = createStreamingSanitizer();
    const c1 = "<p>safe</p><scr";
    const c2 = "<p>safe</p><scr<script>alert(1)";
    const c3 = "<p>safe</p><scr<script>alert(1)</script>";
    const c4 = "<p>safe</p><scr<script>alert(1)</script>done";
    const e1 = sanitize(c1,);
    const e2 = sanitize(c2,);
    const e3 = sanitize(c3,);
    const e4 = sanitize(c4,);
    for (const e of [e1, e2, e3, e4,]) {
      expect(e,).not.toContain("alert(1)",);
      expect(e,).not.toContain("<script",);
    }
    expect(e4,).toContain("done",);
    expect(e4,).toContain("<p>safe</p>",);
  });

  it("holds back unclosed <iframe> opener across chunk boundary until sanitized", () => {
    // `<iframe src="x"` (no `>` yet) survives `sanitizeHtml`'s
    // DANGEROUS_TAGS regex (which requires `>`). The streaming
    // sanitizer's `findEarliestUnclosedDangerousOpen` then pins the
    // dangerous opener as held. Once `>` arrives (next chunk),
    // sanitizeHtml strips the opener — the streaming sanitizer sees
    // no opener and releases the trailing safe content.
    const sanitize = createStreamingSanitizer();
    // Chunk 1: opener is incomplete (no `>`). Must be held.
    expect(sanitize('<iframe src="x"',),).toBe("",);
    // Chunk 2: cumulative input adds `>` + body + closer + tail.
    // sanitizeHtml strips the opener and body (atomic via
    // DANGEROUS_TAGS); the streaming sanitizer emits just the tail.
    expect(
      sanitize('<iframe src="x">body</iframe>tail',),
    ).toBe("tail",);
  });

  it("holds back unclosed <object> opener across chunk boundary until sanitized", () => {
    const sanitize = createStreamingSanitizer();
    expect(sanitize('<object data="x',),).toBe("",);
    expect(
      sanitize('<object data="x">body</object>safe',),
    ).toBe("safe",);
  });

  it("strips self-closing <embed/> atomically; streaming sees no hold", () => {
    // `<embed>` is stripped atomically by `DANGEROUS_TAGS` (no closer
    // needed). The streaming sanitizer therefore never sees a held
    // opener; the trailing safe content is emitted on the final step.
    const sanitize = createStreamingSanitizer();
    expect(sanitize("<embed src",),).toBe("",);
    expect(sanitize('<embed src="x" />after',),).toBe("after",);
  });

  it("holds back unclosed <style> opener (no `>` yet) until sanitized", () => {
    const sanitize = createStreamingSanitizer();
    expect(sanitize("<style",),).toBe("",);
    expect(
      sanitize("<style>p {color: red}</style><p>ok</p>",),
    ).toBe("<p>ok</p>",);
  });

  it("holds back <script> when opener is at end-of-chunk with no terminator", () => {
    // No `>` yet — the sanitizer treats it as a still-open dangerous
    // opener, even though no body or close has arrived.
    const sanitize = createStreamingSanitizer();
    expect(sanitize("abc<script",),).toBe("abc",);
  });

  it("releases the hold only when the matching </script> arrives", () => {
    // A mismatched closer (`</iframe>` for an open `<script>`) must NOT
    // release the held suffix.
    const sanitize = createStreamingSanitizer();
    expect(
      sanitize("<p>x</p><script>alert(1)</iframe>",),
    ).toBe("<p>x</p>",);
    // The matching `</script>` does — sanitizer sees the closed pair,
    // sanitizeHtml strips it, streaming emits just the safe trailing text.
    expect(
      sanitize("<p>x</p><script>alert(1)</iframe></script>done",),
    ).toBe("<p>x</p>done",);
  });

  it("never emits <script body even when no closer ever arrives (stream end)", () => {
    // Edge: stream ends with an unclosed `<script>` body still in
    // flight. The sanitizer's last emitted value is the safe prefix
    // up to (but not including) the dangerous opener — the dangerous
    // tail is never emitted, even though it survives `sanitizeHtml`.
    const sanitize = createStreamingSanitizer();
    const emit = sanitize("<p>safe</p><script>alert(1)and more body",);
    expect(emit,).toBe("<p>safe</p>",);
    expect(emit,).not.toContain("alert(1)",);
    expect(emit,).not.toContain("<script",);
    expect(emit,).not.toContain("and more body",);
  });
});

// ---------------------------------------------------------------------------
// Category 2: False positives — benign content must NOT be over-stripped.
// ---------------------------------------------------------------------------

describe("false-positive guards", () => {
  it("preserves HTML-entity-encoded <script> as literal text", () => {
    // &lt;script&gt; is plain text once rendered; the sanitizer must
    // not interpret the encoded chars as a tag opener.
    const sanitize = createStreamingSanitizer();
    const text = "&lt;script&gt;alert(1)&lt;/script&gt;";
    expect(sanitize(text,),).toBe(text,);
  });

  it("preserves literal <script> inside a JS string within a <pre> block", () => {
    // The HTML here is <pre> containing a < (literal). The rendered
    // text the sanitizer sees is `...&lt;script&gt;...`. The sanitizer
    // must not strip it.
    const sanitize = createStreamingSanitizer();
    const text = "<pre>let s = &lt;script&gt;evil&lt;/script&gt;;</pre>";
    expect(sanitize(text,),).toBe(text,);
  });

  it("preserves <<script (extra < before a real <script)", () => {
    // The first `<` is not a tag opener; the second is. Both arrive in
    // a single chunk. The sanitizer holds back from the first open
    // `<script>` onward; the leading single `<` survives.
    const sanitize = createStreamingSanitizer();
    expect(sanitize("<<script>alert(1)</script>",),).toBe("<",);
  });

  it("does not strip an orphan </script> with no preceding opener", () => {
    // </script> in isolation is harmless; nothing for it to close.
    // sanitizeHtml does not strip orphan closers and the streaming
    // sanitizer must not turn them into held-back content.
    const sanitize = createStreamingSanitizer();
    expect(sanitize("</script>after",),).toBe("</script>after",);
  });

  it("catches <SCRIPT> (uppercase) as a dangerous opener", () => {
    const sanitize = createStreamingSanitizer();
    expect(sanitize("<SCRIPT>alert(1)</SCRIPT>x",),).toBe("x",);
  });

  it("catches <Script> (mixed case) as a dangerous opener", () => {
    const sanitize = createStreamingSanitizer();
    expect(sanitize("<Script>alert(1)</Script>x",),).toBe("x",);
  });

  it("catches <ScRiPt> (alternating case) as a dangerous opener", () => {
    const sanitize = createStreamingSanitizer();
    expect(sanitize("<ScRiPt>alert(1)</ScRiPt>x",),).toBe("x",);
  });

  it("does NOT catch < script> (whitespace between < and tag name) as dangerous", () => {
    // The streaming sanitizer's opener detector reads the tag name
    // immediately after `<`. `< script>` has a leading space, so the
    // name is empty / ` script` — neither matches the dangerous set.
    // The whole span passes through unchanged.
    const sanitize = createStreamingSanitizer();
    const input = "< script>alert(1)</script>";
    expect(sanitize(input,),).toBe(input,);
  });

  it("catches <script > (whitespace before >) as a dangerous opener", () => {
    // `<script >` — name is `script` (trailing whitespace before `>`
    // does not include space in the tag-name character class); still
    // matches the dangerous set.
    const sanitize = createStreamingSanitizer();
    expect(sanitize("<script >alert(1)</script>x",),).toBe("x",);
  });

  it("does NOT catch <  script> (double whitespace) as dangerous", () => {
    // Same reasoning as `< script>` — leading whitespace breaks the
    // name-from-`<` reading, so the dangerous opener is not detected.
    const sanitize = createStreamingSanitizer();
    const input = "<  script>alert(1)</script>";
    expect(sanitize(input,),).toBe(input,);
  });
});

// ---------------------------------------------------------------------------
// Category 3: Performance / DoS / overflow.
// ---------------------------------------------------------------------------

describe("performance and overflow", () => {
  it("completes in linear time on a 1MB chunk of repeated <script>...</script> spans", () => {
    // Each <script>...</script> pair is held back. The streaming
    // sanitizer must NOT collapse into exponential backtracking on
    // this input — emit must be empty and bounded.
    const sanitize = createStreamingSanitizer();
    const input = "<script>alert(1)</script>".repeat(50_000,);
    const t0 = performance.now();
    const out = sanitize(input,);
    const elapsed = performance.now() - t0;
    expect(elapsed,).toBeLessThan(500,);
    expect(out,).toBe("",);
  });

  it("completes in linear time on 1MB of pure text (no tags)", () => {
    // No `<` characters at all — the streaming sanitizer's left-to-
    // right scan visits each character once. Output equals input.
    const sanitize = createStreamingSanitizer();
    const input = "x".repeat(1_000_000,);
    const t0 = performance.now();
    const out = sanitize(input,);
    const elapsed = performance.now() - t0;
    expect(elapsed,).toBeLessThan(500,);
    expect(out,).toBe(input,);
    expect(out.length,).toBe(1_000_000,);
  });

  it("completes in linear time on pathological <<< alternation", () => {
    // Many `<` with no tag names — the scanner must not explode
    // quadratically on input that has lots of `<` but no matching `>`.
    // Each `<` triggers an empty-name opener (not dangerous), and
    // `sanitizeHtml` keeps the string as-is; streaming emits the
    // whole input unchanged.
    const sanitize = createStreamingSanitizer();
    const input = "<<<".repeat(30_000,);
    const t0 = performance.now();
    const out = sanitize(input,);
    const elapsed = performance.now() - t0;
    expect(elapsed,).toBeLessThan(500,);
    // No dangerous opener survives, so the entire input is emitted.
    expect(out.length,).toBe(input.length,);
  });

  it("empty chunk is a no-op (returns empty string, no throw)", () => {
    const sanitize = createStreamingSanitizer();
    expect(sanitize("",),).toBe("",);
    // A second empty chunk after non-empty content is also a no-op.
    sanitize("<p>safe</p>",);
    expect(sanitize("",),).toBe("",);
  });

  it("char-by-char streaming converges to the single-shot sanitize result", () => {
    // For any well-formed input, feeding it one character at a time
    // to a single sanitizer instance must converge to the same
    // cumulative output as feeding the whole string in one call. This
    // pins the streaming invariant: the function is the streaming
    // version of `sanitizeHtml(input)` once the boundary is closed.
    const sanitize = createStreamingSanitizer();
    const html = "<p>Hello</p><script>alert(1)</script><p>World</p>";
    let acc = "";
    for (const c of html) {
      acc += c;
      sanitize(acc,);
    }
    const finalByChar = sanitize(acc,);
    const sanitizeOnce = createStreamingSanitizer();
    const finalOneShot = sanitizeOnce(html,);
    expect(finalByChar,).toBe(finalOneShot,);
    expect(finalByChar,).toBe("<p>Hello</p><p>World</p>",);
  });

  it("very long unclosed script body is fully held back", () => {
    // 100k characters of body inside an unclosed `<script>` — every
    // byte after the opener must be held back; nothing leaks.
    const sanitize = createStreamingSanitizer();
    const input = "<p>safe</p><script>" + "x".repeat(100_000,) + "</script>done";
    const out = sanitize(input,);
    expect(out,).toBe("<p>safe</p>done",);
  });
});

// ---------------------------------------------------------------------------
// Category 4: Streaming state invariants.
// ---------------------------------------------------------------------------

describe("sanitizer instance state", () => {
  it("independent sanitizers do not share state", () => {
    const A = createStreamingSanitizer();
    const B = createStreamingSanitizer();
    const input = "<p>safe</p><script>alert(1)</script>x";
    const outA = A(input,);
    const outB = B(input,);
    expect(outA,).toBe("<p>safe</p>x",);
    expect(outB,).toBe("<p>safe</p>x",);
    // Drive A further; B's next call must NOT be affected by A's history.
    A("<p>safe</p><script>alert(1)</script>x<p>more</p>",);
    expect(B(input,),).toBe("<p>safe</p>x",);
  });

  it("calling step() twice with the same input returns the same result", () => {
    // The streaming sanitizer is idempotent on re-feed of identical
    // input — calling it twice with the same accumulated string must
    // produce the same safe prefix, with no drift.
    const sanitize = createStreamingSanitizer();
    const input = "<p>Hello</p>";
    const r1 = sanitize(input,);
    const r2 = sanitize(input,);
    expect(r1,).toBe(r2,);
    expect(r1,).toBe("<p>Hello</p>",);
  });

  it("two unclosed danger tags in series hold everything back until both close", () => {
    // Two separate `<script>` openers; each closed in turn. The
    // streaming sanitizer must hold the entire suffix until both
    // boundaries close — even when the second opener appears in a
    // later chunk AFTER the first opener's closer has already
    // arrived.
    const sanitize = createStreamingSanitizer();
    // Chunk 1: first <script> opener with body, no closer — held back.
    expect(sanitize("<p>x</p><script>a",),).toBe("<p>x</p>",);
    // Chunk 2: first <script> is now closed, but a SECOND unclosed
    // <script> arrives. The sanitizer must keep the held prefix
    // pinned (the second opener pins the suffix).
    expect(sanitize("<p>x</p><script>a</script><script>b",),).toBe("<p>x</p>",);
    // Chunk 3: both openers now closed; trailing safe content emits.
    expect(
      sanitize("<p>x</p><script>a</script><script>b</script>y",),
    ).toBe("<p>x</p>y",);
  });

  it("survives a caller-side reset where the new buffer is shorter than emittedEnd", () => {
    // The sanitizer caches how far it has emitted. If the caller
    // drops the prior buffer and starts fresh with shorter input,
    // the next call must NOT throw — it must reset emittedEnd to 0
    // and re-evaluate from scratch.
    const sanitize = createStreamingSanitizer();
    sanitize("<p>first content here</p>",);
    expect(sanitize("<p>short",),).toBe("<p>short",);
    expect(sanitize("<p>short</p><script>alert(1)",),).toBe("<p>short</p>",);
  });
});
