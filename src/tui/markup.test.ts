// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";

import { escapeMarkup, } from "./markup";

/**
 * Pins the escape contract every `tags: true` blessed element in the TUI relies
 * on: untrusted text must never reach blessed's tag parser with live braces.
 *
 * The mapping is inlined in this module rather than imported from
 * `blessed.helpers.escape` (see the comment there), so these assertions check
 * the literal output — if the inlined mapping and blessed's ever disagree, this
 * is the test that says so.
 */
describe("escapeMarkup", () => {
  test("escapes both brace kinds to blessed's tag-safe placeholders", () => {
    expect(escapeMarkup("{bold}",),).toBe("{open}bold{close}",);
    expect(escapeMarkup("}",),).toBe("{close}",);
    expect(escapeMarkup("{",),).toBe("{open}",);
  });

  test("neutralizes a full blessed tag so it renders literally", () => {
    // A crafted chat name / asset field carrying a tag must not be interpreted.
    // NOTE: this is a SINGLE pass over the original text - blessed's own
    // helpers.escape uses /[{}]/g, so the `{` in its `{open}` output is NOT
    // re-escaped. Do not "optimize" this into a chained replaceAll; that
    // double-escapes and yields `{open{close}`.
    expect(escapeMarkup("{red-fg}injected{/red-fg}",),)
      .toBe("{open}red-fg{close}injected{open}/red-fg{close}",);
  });

  test("leaves text without braces untouched", () => {
    expect(escapeMarkup("plain text",),).toBe("plain text",);
    expect(escapeMarkup("",),).toBe("",);
  });

  test("escapes every brace, including adjacent and repeated ones", () => {
    expect(escapeMarkup("{{{",),).toBe("{open}{open}{open}",);
    expect(escapeMarkup("{open}",),).toBe("{open}open{close}",);
  });
});
