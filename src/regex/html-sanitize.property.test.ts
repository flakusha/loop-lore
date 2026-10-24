// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Property suite for the SSE sanitize pipeline (fuzz-candidates #11).
 * Universal invariants over arbitrary strings: sanitizing never throws and
 * never grows the text (every stage only removes). Single-pass idempotence
 * and output safety are NOT universal: stage removals can assemble new
 * markup from adjacent fragments (`<scr<style>ipt>` → `<script>`); those
 * counterexamples are pinned below as the module's documented residual
 * risk — the browser sink runs DOMPurify, which is the primary guard
 * (html-sanitize-core.ts header). The module's own ON_EVENT_* patterns are
 * the oracle for handler attributes.
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

  test("KNOWN RESIDUAL: fragment removal can assemble new script markup", () => {
    // Documented, deliberately accepted (defense-in-depth; DOMPurify is the
    // primary sink guard). Pinned so the boundary stays visible — a future
    // fixpoint fix should flip these assertions deliberately.
    const assembled = sanitizeHtml("<scr<style>ipt>alert(1)",);
    expect(assembled,).toBe("<script>alert(1)",);
    expect(hasScriptOpen(assembled,),).toBe(true,);
    expect(sanitizeHtml(assembled,),).toBe("",); // the second pass removes what the first assembled
    const nested = sanitizeHtml("<scr<script>x</script>ipt>alert(1)",);
    expect(nested,).toBe("<script>alert(1)",);
  });
});
