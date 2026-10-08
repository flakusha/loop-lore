// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the server shortcode fallback (htmx/no-JS partials).
 */
import { describe, expect, test, } from "bun:test";
import { formatHtml, } from "./chat-export/format";
import { EMOJI_SHORTCODES, renderShortcodes, } from "./shortcode-emoji";
import { renderChatListItems, } from "./views/chat-render";

const chat = { name: "Test", type: "roleplay", mode: "chat", } as const;

function message(content: string,) {
  return {
    id: "m1",
    content,
    role: "assistant",
    created_at: "2026-01-01T00:00:00.000Z",
    display_name: "Alice",
    model_id: null,
    token_count_total: 42,
  };
}

function row(lastMessage: string,) {
  return [{
    id: "c1",
    name: "Chat",
    type: "solo",
    is_pinned: "",
    updated_at: "2026-01-01 00:00:00",
    created_at: "2026-01-01 00:00:00",
    world_name: null,
    location_name: null,
    encryption_level: "none",
    participant_count: 0,
    last_message: lastMessage,
  },];
}

describe("shortcode-emoji (server fallback)", () => {
  test("allowlisted codes render", () => {
    expect(EMOJI_SHORTCODES["fire"],).toBe("🔥",);
    expect(renderShortcodes("lit :fire:",),).toBe("lit 🔥",);
  });

  test("unknown codes stay literal", () => {
    expect(renderShortcodes("a :nope: b",),).toBe("a :nope: b",);
  });

  test("code spans are exempt", () => {
    expect(renderShortcodes("`:fire:`",),).toBe("`:fire:`",);
  });

  test("export HTML substitutes allowlisted codes", () => {
    const out = formatHtml(chat, [message("lit :fire:",),],);
    expect(out,).toContain("lit 🔥",);
    expect(out,).not.toContain(":fire:",);
  });

  test("export HTML leaves unknown codes literal", () => {
    const out = formatHtml(chat, [message("a :nope: b",),],);
    expect(out,).toContain("a :nope: b",);
  });

  test("chat-list preview substitutes allowlisted codes", () => {
    const out = renderChatListItems(row("lit :fire:",),);
    expect(out,).toContain("lit 🔥",);
  });
});
