// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for tui/chat/display.ts — formatMessageLine renders blessed markup
 * with the actor name when present, falling back to the role, and clips
 * content over 200 chars with an ellipsis.
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
    const out = formatMessageLine(msg({ actorName: "", role: "user", content: "yo", },),);
    expect(out,).toBe("{bold}user{/bold}: yo",);
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
});
