// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for the /context command handler. */
import { describe, expect, test, } from "bun:test";
import { getCommand, type CommandContext, } from "./registry";
import "./context";

describe("/context", () => {
  test("reports loaded context fields", async () => {
    const ctx: CommandContext = {
      chatId: "chat-1",
      activeChat: { id: "chat-1", },
      currentCharacter: { id: "char-1", name: "Lyra", display_name: "Lyra the Bold", },
      messages: [
        { id: "m1", role: "user", content: "hi", created_at: "2026-01-01", },
        { id: "m2", role: "assistant", content: "hello", created_at: "2026-01-01", },
      ],
    };
    const result = await getCommand("context")!([], ctx,);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("- Chat: `chat-1`",);
    expect(result.systemMessage,).toContain("- Character: Lyra the Bold",);
    expect(result.systemMessage,).toContain("- Messages loaded: 2",);
  });

  test("falls back when nothing is loaded", async () => {
    const result = await getCommand("context")!([], { chatId: "chat-1", },);
    expect(result.systemMessage,).toContain("- Chat: `unknown`",);
    expect(result.systemMessage,).toContain("- Character: none",);
    expect(result.systemMessage,).toContain("- Messages loaded: 0",);
  });
});
