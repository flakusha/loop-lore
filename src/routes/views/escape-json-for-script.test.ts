// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Inline `<script type="application/json">` blocks cannot contain a raw `</script>`.
 *
 * `getRawTranslations` is serialised with JSON.stringify and interpolated raw
 * into a script element (src/routes/views/layout.ts). A translation containing
 * a closing script tag terminated the block early, and everything the layout
 * emitted after it became markup. The fix escapes `<`, `>` and `&` as JSON
 * `\\uXXXX` sequences, which JSON.parse decodes back to the original text.
 */
import { describe, expect, test, } from "bun:test";
import { escapeJsonForScript, } from "./escape-html";
import { respond, } from "./layout";

describe("escapeJsonForScript", () => {
  test("a closing script tag in a value cannot terminate the block", () => {
    const json = escapeJsonForScript(JSON.stringify({ evil: "</script><img src=x onerror=alert(1)>", },),);

    expect(json.includes("</script>",),).toBe(false,);
    expect(json.includes("<img",),).toBe(false,);
  });

  test("the escaped document still parses back to the original value", () => {
    const original = { greeting: "</script> a & b > c", nested: { k: "<b>", }, };

    const parsed = JSON.parse(escapeJsonForScript(JSON.stringify(original,),),);

    expect(parsed,).toEqual(original,);
  });

  test("ampersands and U+2028/U+2029 are escaped too", () => {
    const original = { s: "a & b\u2028c\u2029d", };
    const escaped = escapeJsonForScript(JSON.stringify(original,),);

    expect(escaped.includes("&",),).toBe(false,);
    expect(escaped.includes("\u2028",),).toBe(false,);
    expect(JSON.parse(escaped,),).toEqual(original,);
  });

  test("ordinary JSON is untouched apart from the escaped characters", () => {
    const original = { a: 1, b: "two", c: true, d: null, };

    expect(escapeJsonForScript(JSON.stringify(original,),),).toBe(JSON.stringify(original,),);
  });
});

describe("layout identity interpolation", () => {
  const PAYLOAD = "</script><img src=x onerror=alert(1)>";

  test("a script-tag payload in userId/sessionId cannot terminate the layout block", async () => {
    // Goes through the real `respond` -> `wrapWithLayout` path, so this is the
    // rendered page, not the helper in isolation.
    const res = respond("<p>hi</p>", false, "T", PAYLOAD, PAYLOAD,);
    const html = await res.text();

    // The escaped form round-trips back to the payload for the client, so the
    // value is still readable — it just cannot break out of the element.
    const line = html.split("\n",).find((l,) => l.includes("__USER_ID",)) ?? "";
    expect(line,).toContain("globalThis.__USER_ID =",);
    expect(line,).toContain("globalThis.__SESSION_ID =",);
    expect(line,).not.toContain("</script>",);
    expect(line,).not.toContain("<img",);
    expect(line,).toContain("\\u003c/script\\u003e",);
  }, 30_000,);

  test("a benign identity is still interpolated unchanged", async () => {
    const res = respond("<p>hi</p>", false, "T", "u-1", "s-2",);
    const html = await res.text();

    expect(html,).toContain('globalThis.__USER_ID = "u-1";',);
    expect(html,).toContain('globalThis.__SESSION_ID = "s-2";',);
  }, 30_000,);
});
