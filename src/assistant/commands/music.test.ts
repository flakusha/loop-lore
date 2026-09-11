// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for the /music command handler (prompt vs external URL). */
import { describe, expect, test, } from "bun:test";
import { getCommand, type CommandContext, } from "./registry";
import "./music";

const ctx = { chatId: "chat-1", } as CommandContext;

describe("/music", () => {
  test("blank prompt returns usage", async () => {
    const result = await getCommand("music")!([], ctx,);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toMatch(/Usage: \/music/,);
    expect(result.action,).toBeUndefined();
  });

  test("links an external service URL for browser playback", async () => {
    const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    const result = await getCommand("music")!([url], ctx,);
    expect(result.systemMessage,).toContain(`**Music linked:** ${url}`,);
    expect(result.action,).toBe("link-music",);
    expect(result.actionPayload,).toEqual({ url, source: "external", },);
  });

  test("queues a text prompt for generation", async () => {
    const result = await getCommand("music")!(["Epic", "battle", "theme"], ctx,);
    expect(result.systemMessage,).toContain("**Music generation queued:** Epic battle theme",);
    expect(result.action,).toBe("generate-music",);
    expect(result.actionPayload,).toEqual({ prompt: "Epic battle theme", },);
  });
});
