// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import type { CommandContext, } from "../commands/registry";
import { commandMacroRegistry, } from "./command-macros";
import { expandMacros, } from "./engine";

const CTX: CommandContext = {
  chatId: "chat-1",
  activeChat: { id: "chat-1", worldId: "w1", },
  currentCharacter: { id: "a1", name: "Iria", display_name: "Iria the Keeper", },
  messages: [
    { id: "m1", role: "user", content: "older message", created_at: "t0", },
    { id: "m2", role: "assistant", content: "newest message", created_at: "t1", },
  ],
  userId: "user-9",
};

describe("commandMacroRegistry", () => {
  test("resolves char, user, chat and last", () => {
    const out = expandMacros(
      "{{user}} with {{char}} in {{chat}}; last: {{last}}",
      commandMacroRegistry({ ctx: CTX, },),
    );

    expect(out,).toBe("user-9 with Iria the Keeper in chat-1; last: newest message",);
  });

  test("falls back to empty strings for missing context", () => {
    const out = expandMacros(
      "[{{char}}][{{user}}][{{chat}}][{{last}}]",
      commandMacroRegistry({ ctx: { chatId: "c", }, },),
    );

    expect(out,).toBe("[][][][]",);
  });

  test("binds the pipe value", () => {
    const out = expandMacros("echo {{pipe}}", commandMacroRegistry({ ctx: CTX, pipe: "piped text", },),);
    expect(out,).toBe("echo piped text",);
  });

  test("pipe macro is empty outside a pipe", () => {
    const out = expandMacros("[{{pipe}}]", commandMacroRegistry({ ctx: CTX, },),);
    expect(out,).toBe("[]",);
  });

  test("expands innermost-only so pipe text cannot inject macros", () => {
    const out = expandMacros("say {{pipe}}", commandMacroRegistry({ ctx: CTX, pipe: "{{char}}", },),);
    expect(out,).toBe("say {{char}}",);
  });
});
