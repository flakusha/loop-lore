// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for /impersonate and its /char alias. */
import { describe, expect, test, } from "bun:test";
import { getCommand, type CommandContext, } from "./registry";
import "./impersonate";

const ctx = { chatId: "chat-1", } as CommandContext;

describe("/impersonate", () => {
  test("bare command toggles with usage", async () => {
    const result = await getCommand("impersonate")!([], ctx,);
    expect(result.systemMessage,).toMatch(/Usage: \/impersonate/,);
    expect(result.action,).toBe("impersonate-toggle",);
    expect(result.actionPayload,).toEqual({ mode: "toggle", },);
  });

  test("off and stop end impersonation", async () => {
    for (const word of ["off", "STOP",]) {
      const result = await getCommand("impersonate")!([word], ctx,);
      expect(result.systemMessage,).toBe("Stopped impersonating.",);
      expect(result.actionPayload,).toEqual({ mode: "off", },);
    }
  });

  test("name selects that character", async () => {
    const result = await getCommand("impersonate")!(["Lady", "Mara"], ctx,);
    expect(result.systemMessage,).toBe('Impersonating as "Lady Mara"...',);
    expect(result.action,).toBe("impersonate-select",);
    expect(result.actionPayload,).toEqual({ characterName: "Lady Mara", },);
  });

  test("/char mirrors /impersonate including its own usage", async () => {
    const usage = await getCommand("char")!([], ctx,);
    expect(usage.systemMessage,).toMatch(/Usage: \/char/,);
    expect(usage.actionPayload,).toEqual({ mode: "toggle", },);
    const select = await getCommand("char")!(["Jax"], ctx,);
    const direct = await getCommand("impersonate")!(["Jax"], ctx,);
    expect(select.actionPayload,).toEqual(direct.actionPayload,);
  });
});
