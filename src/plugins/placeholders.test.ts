// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { emitPluginEvent, } from "./event-bus";
import { executePluginTool, } from "./tool-executor";
import { getComponentsForMountPoint, } from "./mount-points";
import { mergePluginConfig, } from "./config-merge";

describe("plugin placeholders", () => {
  test("emitPluginEvent counts matches without invoking", async () => {
    let called = 0;
    const handlers = [
      { event: "chat.created", handler: async () => { called += 1; }, },
      { event: "chat.created", handler: async () => { called += 1; }, },
      { event: "other", handler: async () => { called += 1; }, },
    ];
    const n = await emitPluginEvent(handlers, "chat.created", { id: "1", },);
    expect(n,).toBe(2,);
    expect(called,).toBe(0,);
  });

  test("executePluginTool returns error result without invoking", async () => {
    let called = false;
    const res = await executePluginTool(
      {
        name: "demo",
        description: "demo",
        parameters: {},
        handler: async () => { called = true; return { content: "x", }; },
      },
      {},
    );
    expect(res.isError,).toBe(true,);
    expect(called,).toBe(false,);
  });

  test("getComponentsForMountPoint filters by location", () => {
    const components = [
      { type: "web", name: "a", location: "chat.sidebar", } as const,
      { type: "tui", name: "b", location: "chat.header", } as const,
    ];
    expect(getComponentsForMountPoint(components, "chat.sidebar",).length,).toBe(1,);
    expect(getComponentsForMountPoint(components, "nowhere",),).toEqual([],);
  });

  test("mergePluginConfig prefers stored values", () => {
    expect(mergePluginConfig({ a: 1, b: 1, }, { b: 2, }),).toEqual({ a: 1, b: 2, },);
  });
});
