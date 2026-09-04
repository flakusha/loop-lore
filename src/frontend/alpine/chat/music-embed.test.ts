// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * @file Tests for the music-embed fallback card XSS hardening helpers.
 *
 * Defense layers under test:
 *   1. `escText` escapes & < > for HTML child text.
 *   2. `escAttr` additionally escapes `"` to `&quot;` for attribute contexts.
 *   3. `safeUrl` enforces an http(s)/mailto scheme allowlist; everything else
 *      is rewritten to a benign `#blocked` anchor.
 *
 * These three helpers are pure functions (no DOM dependency) so the tests
 * run without `document` polyfills.
 *
 * Regression target: `BUG-frontend-music-embed-fallback-esc-allows-stored-xss-via-attr`.
 */
import { describe, expect, test, } from "bun:test";
import { escAttr, escText, safeUrl, } from "./music-embed";

describe("escText", () => {
  test("escapes ampersand, less-than, greater-than", () => {
    expect(escText(`a & b <c> d`,),).toBe("a &amp; b &lt;c&gt; d",);
  });

  test("passes quotes through unchanged (use escAttr for attribute context)", () => {
    expect(escText(`he said "hi"`,),).toBe(`he said "hi"`,);
  });

  test("treats null/undefined as empty string", () => {
    expect(escText(null,),).toBe("",);
    expect(escText(undefined,),).toBe("",);
  });

  test("does not double-escape `&lt;` (already-escaped values stay raw)", () => {
    // Match browser textContent behavior: rendering treats `&lt;` as plain
    // text. We do not normalize here; downstream consumers should not feed
    // pre-escaped values to escText.
    expect(escText("&lt;",),).toBe("&amp;lt;",);
  });
});

describe("escAttr", () => {
  test('escapes & < > and "', () => {
    expect(escAttr(`a & b <c> d "e" f`,),).toBe("a &amp; b &lt;c&gt; d &quot;e&quot; f",);
  });

  test("closes the attribute-breakout vector on alt=", () => {
    // A user-controlled title containing a double-quote could previously
    // break out of the `alt="..."` attribute. The output must contain
    // `&quot;` and never a literal `"` outside the surrounding delimiters.
    const escaped = escAttr(`evil"onerror="alert(1)`,);
    expect(escaped,).not.toContain(`"onerror=`,);
    expect(escaped,).toContain("&quot;",);
  });

  test("treats null/undefined as empty string", () => {
    expect(escAttr(null,),).toBe("",);
    expect(escAttr(undefined,),).toBe("",);
  });
});

describe("safeUrl", () => {
  test("accepts http: and https: schemes", () => {
    expect(safeUrl("http://music.example.com/track/1",),).toBe(
      "http://music.example.com/track/1",
    );
    expect(safeUrl("https://cdn.example.com/a.jpg",),).toBe(
      "https://cdn.example.com/a.jpg",
    );
  });
  test("accepts mailto: scheme", () => {
    expect(safeUrl("mailto:[email protected]",),).toBe(
      "mailto:[email protected]",
    );
  });

  test("rejects javascript: URLs", () => {
    expect(safeUrl("javascript:alert(1)",),).toBe("#blocked",);
  });

  test("rejects data: URLs", () => {
    expect(safeUrl("data:text/html,<script>alert(1)</script>",),).toBe("#blocked",);
  });

  test("rejects vbscript: URLs", () => {
    expect(safeUrl("vbscript:msgbox(1)",),).toBe("#blocked",);
  });

  test("rejects file: URLs", () => {
    expect(safeUrl("file:///etc/passwd",),).toBe("#blocked",);
  });

  test("rejects protocol-relative URLs", () => {
    expect(safeUrl("//cdn.example.com/a.jpg",),).toBe("#blocked",);
  });

  test("rejects empty string", () => {
    expect(safeUrl("",),).toBe("#blocked",);
  });

  test("rejects null and undefined", () => {
    expect(safeUrl(null,),).toBe("#blocked",);
    expect(safeUrl(undefined,),).toBe("#blocked",);
  });

  test("rejects relative paths", () => {
    expect(safeUrl("/track/123",),).toBe("#blocked",);
  });

  test("scheme allowlist is case-insensitive", () => {
    expect(safeUrl("HTTPS://cdn.example.com",),).toBe(
      `HTTPS://cdn.example.com`,
    );
    expect(safeUrl("MAILTO:[email protected]",),).toBe(
      `MAILTO:[email protected]`,
    );
  });

  test("escapes attribute-breaking chars in the URL fragment", () => {
    expect(safeUrl(`https://x.y/?a"b&c=d"`,),).toBe(
      `https://x.y/?a&quot;b&amp;c=d&quot;`,
    );
  });
});
