// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for the /sfx command handler and its /sound alias. */
import { describe, expect, test, } from "bun:test";
import { getCommand, type CommandContext, } from "./registry";
import "./sfx";

const ctx = { chatId: "chat-1", } as CommandContext;

describe("/sfx", () => {
  test("blank prompt returns usage", async () => {
    const result = await getCommand("sfx")!([], ctx,);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toMatch(/Usage: \/sfx/,);
    expect(result.action,).toBeUndefined();
  });

  test("queues the trimmed prompt", async () => {
    const result = await getCommand("sfx")!(["Thunder", "crashing"], ctx,);
    expect(result.systemMessage,).toBe("**Sound effect queued:** Thunder crashing",);
    expect(result.action,).toBe("generate-sfx",);
    expect(result.actionPayload,).toEqual({ prompt: "Thunder crashing", },);
  });

  test("/sound aliases /sfx", async () => {
    const aliased = await getCommand("sound")!(["Rain"], ctx,);
    const direct = await getCommand("sfx")!(["Rain"], ctx,);
    expect(aliased,).toEqual(direct,);
    expect(aliased.action,).toBe("generate-sfx",);
  });
});
