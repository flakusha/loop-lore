// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for the /image command handler. */
import { describe, expect, test, } from "bun:test";
import { getCommand, type CommandContext, } from "./registry";
import "./image";

const ctx = { chatId: "chat-1", } as CommandContext;

describe("/image", () => {
  test("blank prompt returns usage", async () => {
    for (const args of [[], ["   ",]] as string[][]) {
      const result = await getCommand("image")!(args, ctx,);
      expect(result.handled,).toBe(true,);
      expect(result.systemMessage,).toMatch(/Usage: \/image/,);
      expect(result.action,).toBeUndefined();
    }
  });

  test("dispatches a generate-image action with the trimmed prompt", async () => {
    const result = await getCommand("image")!(["A", "castle", " "], ctx,);
    expect(result,).toEqual({
      action: "generate-image",
      actionPayload: { prompt: "A castle", },
      handled: true,
    },);
  });
});
