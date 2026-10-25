// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import "./music";
import "./sfx";
import "./video";
import { getCommand, } from "./registry";

/**
 * Run a registered stub command with a prompt.
 * @param name
 * @param args
 * @returns the command's system message
 */
async function runStub(name: string, args: string[],): Promise<string> {
  const handler = getCommand(name,);
  expect(handler,).toBeDefined();
  const result = await handler!(args, { chatId: "chat-1", },);
  return result.systemMessage ?? "";
}

describe("generation stub commands", () => {
  test("/music does not claim a generation was queued", async () => {
    const message = await runStub("music", ["epic", "battle", "theme",],);

    expect(message,).not.toContain("queued",);
    expect(message,).not.toContain("will appear in the chat",);
    expect(message,).toContain("not implemented yet",);
    expect(message,).toContain("epic battle theme",);
  });

  test("/sfx does not claim a generation was queued", async () => {
    const message = await runStub("sfx", ["thunder", "crashing",],);

    expect(message,).not.toContain("queued",);
    expect(message,).toContain("not implemented yet",);
    expect(message,).toContain("thunder crashing",);
  });

  test("/sound aliases /sfx", async () => {
    const message = await runStub("sound", ["thunder", "crashing",],);

    expect(message,).not.toContain("queued",);
    expect(message,).toContain("not implemented yet",);
  });

  test("/video does not claim a generation was queued", async () => {
    const message = await runStub("video", ["a", "dragon", "flying",],);

    expect(message,).not.toContain("queued",);
    expect(message,).not.toContain("will appear in the chat",);
    expect(message,).toContain("not implemented yet",);
    expect(message,).toContain("a dragon flying",);
  });
});
