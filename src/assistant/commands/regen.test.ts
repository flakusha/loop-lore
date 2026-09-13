// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it } from "bun:test";
import { getCommand, type CommandContext } from "./registry";
import "./index";
import { listMessageActions, runRegenAction } from "./regen";

const history = {
  chatId: "c1",
  messages: [
    { id: "1", role: "user", content: "hi", created_at: "t" },
    { id: "2", role: "assistant", content: "a somewhat wordy reply", created_at: "t" },
  ],
} as CommandContext;

describe("regen command", () => {
  it("is registered", () => {
    expect(getCommand("regen")).toBeDefined();
  });

  it("declares the three guided actions", () => {
    expect(listMessageActions().map((a) => a.id)).toEqual(["try-again", "add-details", "more-concise"]);
  });

  it("lists usage for unknown actions", async () => {
    const result = await runRegenAction([], history, {});
    expect(result.systemMessage).toContain("/regen");
    expect(result.systemMessage).toContain("try-again");
  });

  it("reports when no assistant message exists", async () => {
    const result = await runRegenAction(["try-again"], { chatId: "c1" }, {});
    expect(result.systemMessage).toContain("No assistant message");
  });

  it("routes try-again through the rewrite path", async () => {
    const result = await runRegenAction(["try-again"], history, {
      complete: async () => ({ content: "tighter reply" }),
    });
    expect(result.systemMessage).toContain("tighter reply");
    expect(result.systemMessage).not.toContain("LLM unavailable");
  });

  it("routes more-concise through the concise style", async () => {
    let system = "";
    await runRegenAction(["more-concise"], history, {
      complete: async (req) => {
        system = String(req.messages[0]?.content ?? "");
        return { content: "short" };
      },
    });
    expect(system).toContain("concise style");
  });

  it("routes add-details through local improve without a backend", async () => {
    const result = await runRegenAction(["add-details"], history, {});
    expect(result.systemMessage).toContain("Improved:");
    expect(result.systemMessage).toContain("LLM unavailable");
  });
});
