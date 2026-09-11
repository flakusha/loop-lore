// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for the /video command handler. */
import { describe, expect, test, } from "bun:test";
import { getCommand, type CommandContext, } from "./registry";
import "./video";

const ctx = { chatId: "chat-1", } as CommandContext;

describe("/video", () => {
  test("blank prompt returns usage", async () => {
    const result = await getCommand("video")!([], ctx,);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toMatch(/Usage: \/video/,);
    expect(result.action,).toBeUndefined();
  });

  test("queues generation with a frontend action", async () => {
    const result = await getCommand("video")!(["A", "dragon", "flying"], ctx,);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("**Video generation queued:** A dragon flying",);
    expect(result.action,).toBe("generate-video",);
    expect(result.actionPayload,).toEqual({ prompt: "A dragon flying", },);
  });
});
