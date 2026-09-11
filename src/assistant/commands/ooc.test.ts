// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for the /ooc command handler. */
import { describe, expect, test, } from "bun:test";
import { getCommand, type CommandContext, } from "./registry";
import "./ooc";

const ctx = {} as CommandContext;

describe("/ooc", () => {
  test("empty args return usage", async () => {
    const result = await getCommand("ooc")!([], ctx,);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toMatch(/Usage: \/ooc/,);
    expect(result.action,).toBeUndefined();
  });

  test("prefixes the joined args with the OOC marker", async () => {
    const result = await getCommand("ooc")!(["brb", "five", "minutes"], ctx,);
    expect(result,).toEqual({
      systemMessage: "**(OOC)** brb five minutes",
      action: "inject-ooc",
      handled: true,
    },);
  });
});
