// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Property suite for the SSE sanitize pipeline (fuzz-candidates #11).
 * Universal invariants over arbitrary strings: sanitizing never throws,
 * never grows the text, is IDEMPOTENT, and the output contains no script
 * openers (strip-to-fixpoint: reassembly from adjacent fragments is
 * re-stripped on the next pass — the former KNOWN RESIDUAL mXSS pins are
 * flipped). The module's own ON_EVENT_* patterns remain the oracle for
 * handler attributes; the browser sink's DOMPurify is still the primary
 * guard (html-sanitize-core.ts header).
 *
 * Resource contract: pure string functions — no I/O, no shared state.
 */

import { describe, expect, test, } from "bun:test";
import fc from "fast-check";
import {
  ON_EVENT_DOUBLE,
  ON_EVENT_SINGLE,
  ON_EVENT_UNQUOTED,
  sanitizeHtml,
} from "./html-sanitize-core";

const RUNS = { numRuns: 200, seed: 20261024, };

const hasScriptOpen = (html: string,): boolean => html.toLowerCase().includes("<script",);
const hasInlineHandler = (html: string,): boolean =>
  [ON_EVENT_DOUBLE, ON_EVENT_SINGLE, ON_EVENT_UNQUOTED,].some((re,) => {
    re.lastIndex = 0;
    return re.test(html,);
  },);

describe("sanitizeHtml — properties", () => {
  test("never throws for arbitrary input", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200, },), (x,) => {
        expect(() => sanitizeHtml(x,)).not.toThrow();
      },),
      RUNS,
    );
  });

  test("sanitizing never grows the text (every stage only removes)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200, },), (x,) => {
        const once = sanitizeHtml(x,);
        expect(sanitizeHtml(once,).length,).toBeLessThanOrEqual(once.length,);
      },),
      RUNS,
    );
  });

  test("benign markup survives and the known vectors are stripped", () => {
    expect(sanitizeHtml("<p>safe</p>",),).toBe("<p>safe</p>",);
    const handlerStripped = sanitizeHtml("<img src=x onerror=alert(1)>",);
    expect(handlerStripped,).not.toContain("onerror",);
    expect(hasInlineHandler(handlerStripped,),).toBe(false,); // module's own ON_EVENT_* oracle
    expect(sanitizeHtml("<a href='javascript:alert(1)'>x</a>",),).not.toContain("javascript:",);
    expect(sanitizeHtml("<script>alert(1)</script>ok",),).toBe("ok",);
  });

  test("FIXPOINT (was KNOWN RESIDUAL): fragment reassembly is re-stripped; output is stable and script-free", () => {
    // The old single-pass pipeline assembled '<scr<style>ipt>alert(1)' into
    // a live '<script>' opener. Strip-to-fixpoint re-strips it.
    const assembled = sanitizeHtml("<scr<style>ipt>alert(1)",);
    expect(hasScriptOpen(assembled,),).toBe(false,);
    expect(sanitizeHtml(assembled,),).toBe(assembled,); // idempotent

    const nested = sanitizeHtml("<scr<script>x</script>ipt>alert(1)",);
    expect(hasScriptOpen(nested,),).toBe(false,);
    expect(sanitizeHtml(nested,),).toBe(nested,);
  });

  test("output is idempotent and script-free for arbitrary input", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200, },), (x,) => {
        const once = sanitizeHtml(x,);
        expect(sanitizeHtml(once,),).toBe(once,);
        expect(hasScriptOpen(once,),).toBe(false,);
      },),
      RUNS,
    );
  });
});
