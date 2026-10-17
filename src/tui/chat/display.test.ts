// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for tui/chat/display.ts — formatMessageLine renders blessed markup
 * with the actor name when present, falling back to the role, and clips
 * content over 200 columns with an ellipsis.
 */
import { describe, expect, it, } from "bun:test";
import { formatMessageLine, } from "./display";
import type { ChatMessage, } from "./types";

function msg(overrides: Partial<ChatMessage> = {},): ChatMessage {
  return {
    id: "m1",
    role: "user",
    content: "hi",
    ...overrides,
  };
}

describe("formatMessageLine", () => {
  it("renders the actor name when present", () => {
    const out = formatMessageLine(msg({ actorName: "Alice", content: "hello", },),);
    expect(out,).toBe("{bold}Alice{/bold}: hello",);
  });

  it("falls back to role when actorName is absent", () => {
    const out = formatMessageLine(msg({ role: "assistant", content: "yo", },),);
    expect(out,).toBe("{bold}assistant{/bold}: yo",);
  });

  it("falls back to role when actorName is empty string (falsy)", () => {
    const out = formatMessageLine(msg({ actorName: "", role: "user", content: "", },),);
    expect(out,).toBe("{bold}user{/bold}: ",);
  });

  it("prefers actorName over role when both set", () => {
    const out = formatMessageLine(msg({ actorName: "Bob", role: "user", content: "yo", },),);
    expect(out,).toBe("{bold}Bob{/bold}: yo",);
  });

  it("returns content unchanged at exactly 200 characters", () => {
    const content = "x".repeat(200,);
    const out = formatMessageLine(msg({ content, },),);
    expect(out.endsWith(content,),).toBe(true,);
    expect(out.endsWith("...",),).toBe(false,);
    expect(out.length,).toBe("{bold}user{/bold}: ".length + 200,);
  });

  it("truncates content past 200 characters with an ellipsis", () => {
    const content = "y".repeat(250,);
    const out = formatMessageLine(msg({ content, },),);
    const prefix = "{bold}user{/bold}: ";
    expect(out.startsWith(prefix,),).toBe(true,);
    expect(out.endsWith("...",),).toBe(true,);
    expect(out,).toBe(`${prefix}${"y".repeat(200,)}...`,);
  });

  it("handles empty content", () => {
    const out = formatMessageLine(msg({ content: "", },),);
    expect(out,).toBe("{bold}user{/bold}: ",);
  });

  // --- Boundary tests: surrogate pairs & wide glyphs ---

  it("does not split a surrogate pair at the 200-column boundary", () => {
    // U+1F389 (PARTY POPPER) is a surrogate pair in JS: length 2, display width 2.
    // A code-unit slice at position 200 can cut between the two surrogates,
    // leaving a lone low surrogate — invalid UTF-16 that corrupts the render row.
    const emoji = "\u{1F389}";
    const content = "a".repeat(199,) + emoji; // 199a (199 cols) + emoji (2 cols) = 201
    const out = formatMessageLine(msg({ content, },),);
    const prefix = "{bold}user{/bold}: ";
    const tail = out.slice(prefix.length,);
    // Total display width must never exceed 200 + 3 for "..."
    expect(Bun.stringWidth(tail,),).toBeLessThanOrEqual(203,);
    // Last code unit must not be a lone low surrogate (U+DC00-U+DFFF).
    const lastCode = tail.charCodeAt(tail.length - 1,);
    expect(lastCode < 0xDC00 || lastCode > 0xDFFF,).toBe(true,);
  });

  it("does not split a wide CJK glyph at the 200-column boundary", () => {
    // Each CJK character occupies 2 terminal columns.
    // The algorithm must stop before the first one if it would overflow.
    const cjk = "\u{65E5}\u{672C}"; // 日 (2 cols) 本 (2 cols)
    const content = "a".repeat(199,) + cjk; // 199a (199 cols) + first 日 (2 cols) = 201
    const out = formatMessageLine(msg({ content, },),);
    const prefix = "{bold}user{/bold}: ";
    const tail = out.slice(prefix.length,);
    expect(Bun.stringWidth(tail,),).toBeLessThanOrEqual(203,);
    // Output must not contain any CJK characters — the cut must happen before them.
    expect(/[\u4e00-\u9fff]/.test(tail,),).toBe(false,);
  });

  it("ellipsis is appended when wide glyphs fill the column budget exactly", () => {
    // 100 emoji x 2 cols = 200 cols — no ellipsis.
    const emoji = "\u{1F389}";
    const content100 = emoji.repeat(100,);
    const out100 = formatMessageLine(msg({ content: content100, },),);
    expect(out100.endsWith("...",),).toBe(false,);
    expect(
      Bun.stringWidth(out100.replace("{bold}user{/bold}: ", "",),),
    ).toBe(200,);

    // 101 emoji x 2 = 202 cols — ellipsis appended.
    const out101 = formatMessageLine(msg({ content: emoji.repeat(101,), },),);
    expect(out101.endsWith("...",),).toBe(true,);
    // Width of the non-prefix, non-ellipsis portion must be exactly 200.
    const withoutPrefixAndEllipsis = out101
      .replace("{bold}user{/bold}: ", "",)
      .replace("...", "",);

    expect(Bun.stringWidth(withoutPrefixAndEllipsis,),).toBe(200,);
  });

  // --- Markup escaping tests ---

  it("escapes braces in actorName so they render literally", () => {
    const out = formatMessageLine(msg({ actorName: "{bold}Alice{/bold}", content: "hi", },),);
    expect(out,).toBe("{bold}{open}bold{close}Alice{open}/bold{close}{/bold}: hi",);
  });

  it("escapes braces in role so they render literally", () => {
    const out = formatMessageLine(msg({ role: "{red-fg}user{/red-fg}", content: "hi", },),);
    expect(out,).toBe("{bold}{open}red-fg{close}user{open}/red-fg{close}{/bold}: hi",);
  });

  it("escapes braces in content so they render literally", () => {
    const out = formatMessageLine(msg({ content: "hello {bold}world{/bold}", },),);
    expect(out,).toContain("{open}bold{close}world{open}/bold{close}",);
    expect(out,).not.toContain("{bold}world{close}",);
  });

  it("escapes both open and close braces", () => {
    const out = formatMessageLine(msg({ content: "}{", },),);
    expect(out,).toContain("{close}",);
    expect(out,).toContain("{open}",);
  });
});
