// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for the /narrate command handler. */
import { describe, expect, test, } from "bun:test";
import { getCommand, type CommandContext, } from "./registry";
import "./narrate";

const ctx = {} as CommandContext;

describe("/narrate", () => {
  test("empty args return usage", async () => {
    const result = await getCommand("narrate")!([], ctx,);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toMatch(/Usage: \/narrate/,);
    expect(result.action,).toBeUndefined();
  });

  test("joins args into an inject-narration message", async () => {
    const result = await getCommand("narrate")!(["Thunder", "rolls", "outside."], ctx,);
    expect(result,).toEqual({
      systemMessage: "Thunder rolls outside.",
      action: "inject-narration",
      handled: true,
    },);
  });
});
