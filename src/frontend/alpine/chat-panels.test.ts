// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { collectAssistantToolCalls, } from "./chat-panels";

describe("collectAssistantToolCalls", () => {
  test("returns empty for no messages", () => {
    expect(collectAssistantToolCalls([],),).toEqual([],);
  });

  test("returns empty when no tool calls", () => {
    expect(collectAssistantToolCalls([{ id: "m1", },],),).toEqual([],);
  });

  test("flattens tool calls newest first", () => {
    const msgs = [
      { id: "m1", actor_name: "A", tool_calls: [{ function: { name: "f1", arguments: "{}", }, },], },
      {
        id: "m2",
        actor_name: "B",
        tool_calls: [{ function: { name: "f2", arguments: "{}", }, }, { function: { name: "f3", arguments: "{}", }, },],
      },
    ];

    const res = collectAssistantToolCalls(msgs,);
    expect(res.map((r,) => r.function.name),).toEqual(["f2", "f3", "f1",],);
    expect(res[0]?.actorId,).toBe("m2",);
    expect(res[0]?.actorName,).toBe("B",);
  });

  test("skips null tool_calls", () => {
    const msgs = [
      { id: "m1", tool_calls: null, },
      { id: "m2", tool_calls: [{ function: { name: "f", arguments: "x", }, },], },
    ];

    expect(collectAssistantToolCalls(msgs,).length,).toBe(1,);
  });

  test("caps at 20", () => {
    const calls = Array.from({ length: 25, }, (_, i,) => ({ function: { name: `f${i}`, arguments: "{}", }, }),);
    const msgs = [{ id: "m1", tool_calls: calls, },];
    expect(collectAssistantToolCalls(msgs,).length,).toBe(20,);
  });
});
