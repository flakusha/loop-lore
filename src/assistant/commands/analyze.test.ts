// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it } from "bun:test";
import { runAnalyze } from "./analyze";
import { getCommand, type CommandContext } from "./registry";
import "./index";

const ctx = { chatId: "c1" } as CommandContext;

function stubProfile() {
  return {
    intent: "question" as const,
    clarity: 0.8,
    issues: ["vague pronoun"],
    suggestions: ["name the subject"],
    confidence: 0.9,
  };
}

describe("runAnalyze", () => {
  it("returns usage on empty text", async () => {
    const result = await runAnalyze([], ctx);
    expect(result.systemMessage).toContain("/analyze");
    expect(result.handled).toBe(true);
  });

  it("renders the stubbed profile", async () => {
    const result = await runAnalyze(["what is it?"], ctx, { analyze: async () => stubProfile() });
    expect(result.systemMessage).toContain("question");
    expect(result.systemMessage).toContain("80%");
    expect(result.systemMessage).toContain("vague pronoun");
    expect(result.actionPayload).toMatchObject({ intent: "question" });
  });

  it("degrades when the backend is unreachable", async () => {
    const bare = await runAnalyze(["hello"], ctx);
    expect(bare.systemMessage).toContain("unavailable");
    const nulled = await runAnalyze(["hello"], ctx, { analyze: async () => null });
    expect(nulled.systemMessage).toContain("unavailable");
  });

  it("registers the /analyze command", () => {
    expect(getCommand("analyze")).toBeDefined();
  });
});
