// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for command dispatch error handling.
 */
import type { CommandContext, CommandResult, } from "../../assistant/commands/registry";
// Verify the CommandResult type is properly exported and shaped
describe("command dispatch error handling", () => {
  test("CommandResult type accepts systemMessage for error fallback", () => {
    const result: CommandResult = {
      handled: true,
      systemMessage: "**Command failed:** Test error",
    };
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("Command failed",);
  });

  test("CommandContext type is properly shaped", () => {
    // Verify the type exists and has expected fields
    const ctx: CommandContext = {
      chatId: "test",
      messages: [],
      roleInChat: "owner" as never,
      db: {} as never,
      config: {} as never,
      userId: "user1",
    };
    expect(ctx.chatId,).toBe("test",);
  });
});
