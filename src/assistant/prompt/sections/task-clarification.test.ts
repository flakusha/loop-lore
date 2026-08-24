// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import type { AssembleActor, AssembleContext, } from "../types";
import { taskClarificationSection, } from "./task-clarification";

function baseActor(overrides: Partial<AssembleActor> = {},): AssembleActor {
  return {
    id: "a",
    type: "character",
    display_name: "Alice",
    system_prompt: null,
    description: null,
    personality: null,
    scenario: null,
    post_history_instructions: null,
    mes_example: null,
    agent_role: null,
    ...overrides,
  };
}

function fakeCtx(overrides: Partial<AssembleContext> = {},): AssembleContext {
  return {
    db: {} as AssembleContext["db"],
    actor: baseActor(),
    chat: { id: "c", mode: "story", world_id: null, current_location_id: null, },
    params: { actorId: "a", chatId: "c", modelId: "m", },
    isStory: true,
    tokenBudget: 32_000,
    ...overrides,
  };
}

describe("taskClarificationSection", () => {
  it("is enabled when task is omitted (defaults to chat-reply)", () => {
    expect(taskClarificationSection.enabled(fakeCtx(),),).toBe(true,);
  });

  it("is disabled when task is explicitly null (opt-out)", () => {
    expect(taskClarificationSection.enabled(fakeCtx({ task: null, },),),).toBe(false,);
  });

  it("build returns empty array when task is null", async () => {
    const msgs = await taskClarificationSection.build(fakeCtx({ task: null, },),);
    expect(msgs,).toHaveLength(0,);
  });

  it("shows the character in role for a character actor", async () => {
    const msgs = await taskClarificationSection.build(fakeCtx(),);
    expect(msgs,).toHaveLength(1,);
    expect(msgs[0]!.role,).toBe("system",);
    expect(msgs[0]!.content,).toContain("[Task]",);
    expect(msgs[0]!.content,).toContain("generate the next assistant reply",);
    expect(msgs[0]!.content,).toContain("Character in role: Alice",);
    expect(msgs[0]!.content,).not.toContain("Assistant persona",);
  });

  it("shows the assistant persona for a narrator actor", async () => {
    const msgs = await taskClarificationSection.build(
      fakeCtx({ actor: baseActor({ type: "narrator", display_name: "Narrator", },), },),
    );
    expect(msgs[0]!.content,).toContain("Assistant persona: Narrator",);
    expect(msgs[0]!.content,).not.toContain("Character in role",);
  });

  it("shows the game master for a gm-decision task", async () => {
    const msgs = await taskClarificationSection.build(
      fakeCtx({ task: "gm-decision", actor: baseActor({ display_name: "Worldweaver", },), },),
    );
    expect(msgs[0]!.content,).toContain("Game master: Worldweaver",);
    expect(msgs[0]!.content,).not.toContain("Character in role",);
  });

  it("uses the provided task and action", async () => {
    const msgs = await taskClarificationSection.build(
      fakeCtx({ task: "vn-choice", action: "pick-3", },),
    );
    expect(msgs[0]!.content,).toContain("generate choice cards for a visual-novel scene",);
    expect(msgs[0]!.content,).toContain("pick-3",);
  });
});
