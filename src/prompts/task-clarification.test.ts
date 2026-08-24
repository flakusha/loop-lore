// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import { buildTaskClarification, } from "./task-clarification";

describe("buildTaskClarification", () => {
  it("renders a known task label with context", () => {
    const s = buildTaskClarification({
      task: "gm-decision",
      chatMode: "story",
      characterName: "Bob",
    },);
    expect(s,).toContain("game-master decision",);
    expect(s,).toContain("mode=story",);
    expect(s,).toContain("Bob",);
  });

  it("falls back to the raw task string for unknown tasks", () => {
    const s = buildTaskClarification({ task: "weird-task", },);
    expect(s,).toContain("weird-task",);
  });

  it("includes the action context when present", () => {
    const s = buildTaskClarification({ task: "chat-reply", action: "angry", },);
    expect(s,).toContain("Action context: angry",);
  });

  it("renders assistant and gm names when present", () => {
    const s = buildTaskClarification({
      task: "gm-decision",
      gmName: "Worldweaver",
      assistantName: "Helper",
    },);
    expect(s,).toContain("Assistant persona: Helper",);
    expect(s,).toContain("Game master: Worldweaver",);
  });

  it("omits empty context fields", () => {
    const s = buildTaskClarification({ task: "summarize", },);
    expect(s,).not.toContain("Character in role",);
    expect(s,).not.toContain("Action context",);
    expect(s,).not.toContain("Assistant persona",);
    expect(s,).not.toContain("Game master",);
  });
});
