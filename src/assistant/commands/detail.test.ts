// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for the /detail command handler. */
import { describe, expect, test, } from "bun:test";
import { getCommand, type CommandContext, } from "./registry";
import "./detail";

const ctx = { chatId: "chat-1", } as CommandContext;

describe("/detail", () => {
  test("rejects missing and unknown levels with usage", async () => {
    for (const args of [[], ["verbose",]] as string[][]) {
      const result = await getCommand("detail")!(args, ctx,);
      expect(result.handled,).toBe(true,);
      expect(result.systemMessage,).toMatch(/Usage: \/detail/,);
      expect(result.action,).toBeUndefined();
    }
  });

  test("accepts each level case-insensitively", async () => {
    for (const level of ["immersion", "basic", "detailed",]) {
      const result = await getCommand("detail")!([level.toUpperCase(),], ctx,);
      expect(result,).toEqual({
        action: "set-detail-level",
        actionPayload: { level, },
        handled: true,
      },);
    }
  });
});
