// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { emitPluginEvent, } from "./event-bus";
import { executePluginTool, } from "./tool-executor";
import { getComponentsForMountPoint, } from "./mount-points";
import { mergePluginConfig, } from "./config-merge";

describe("emitPluginEvent", () => {
  test("invokes matches in order with payload", async () => {
    const seen: unknown[] = [];
    const handlers = [
      { event: "chat.created", handler: async (d: unknown) => { seen.push(["a", d,],); }, },
      { event: "other", handler: async () => { seen.push(["skip",],); }, },
      { event: "chat.created", handler: async (d: unknown) => { seen.push(["b", d,],); }, },
    ];
    const n = await emitPluginEvent(handlers, "chat.created", { id: "1", },);
    expect(n,).toBe(2,);
    expect(seen,).toEqual([["a", { id: "1", },], ["b", { id: "1", },],],);
  });

  test("isolates throwing handler and reports via onError", async () => {
    const errors: unknown[] = [];
    let after = false;
    const boom = new Error("boom",);
    const handlers = [
      { event: "e", handler: async () => { throw boom; }, },
      { event: "e", handler: async () => { after = true; }, },
    ];
    const n = await emitPluginEvent(handlers, "e", undefined, {
      onError: (error) => { errors.push(error,); },
    },);
    expect(n,).toBe(2,);
    expect(after,).toBe(true,);
    expect(errors,).toEqual([boom,],);
  });

  test("silent without onError and zero on no match", async () => {
    const handlers = [{ event: "e", handler: async () => { throw new Error("x",); }, },];
    expect(await emitPluginEvent(handlers, "e",),).toBe(1,);
    expect(await emitPluginEvent(handlers, "nope",),).toBe(0,);
  });
});

describe("executePluginTool", () => {
  const tool = (overrides = {}) => ({
    name: "demo",
    description: "demo",
    parameters: {},
    handler: async () => ({ content: "ok", }),
    ...overrides,
  });

  test("returns handler result and passes params", async () => {
    let got: Record<string, unknown> | undefined;
    const res = await executePluginTool(
      tool({ handler: async (p: Record<string, unknown>) => { got = p; return { content: "ok", metadata: { n: 1, }, }; }, },),
      { q: "hi", },
    );
    expect(res,).toEqual({ content: "ok", metadata: { n: 1, }, },);
    expect(got,).toEqual({ q: "hi", },);
  });

  test("handler throw becomes isError result", async () => {
    const res = await executePluginTool(
      tool({ handler: async () => { throw new Error("bad input",); }, },),
      {},
    );
    expect(res.isError,).toBe(true,);
    expect(res.content,).toContain("bad input",);
  });

  test("timeout becomes isError result", async () => {
    const res = await executePluginTool(
      tool({
        timeoutMs: 5,
        handler: () => new Promise<{ content: string, }>(() => {}),
      },),
      {},
    );
    expect(res.isError,).toBe(true,);
    expect(res.content,).toContain("timed out",);
  });
});

describe("getComponentsForMountPoint", () => {
  test("filters by location preserving order", () => {
    const components = [
      { type: "web", name: "a", location: "chat.sidebar", } as const,
      { type: "tui", name: "b", location: "chat.header", } as const,
      { type: "web", name: "c", location: "chat.sidebar", } as const,
    ];
    expect(getComponentsForMountPoint(components, "chat.sidebar",).map((c,) => c.name,),).toEqual(["a", "c",],);
    expect(getComponentsForMountPoint(components, "nowhere",),).toEqual([],);
  });
});

describe("mergePluginConfig", () => {
  test("deep-merges objects, replaces arrays and scalars", () => {
    expect(
      mergePluginConfig(
        { ui: { theme: "dark", page: 1, }, tags: ["a",], n: 1, },
        { ui: { page: 2, }, tags: ["b", "c",], n: 2, },
      ),
    ).toEqual({ ui: { theme: "dark", page: 2, }, tags: ["b", "c",], n: 2, },);
  });

  test("enforces required schema keys", () => {
    const schema = { type: "object" as const, properties: {}, required: ["token",], };
    expect(() => mergePluginConfig({}, {}, schema,),).toThrow("token",);
    expect(mergePluginConfig({}, { token: "x", }, schema,),).toEqual({ token: "x", },);
  });
});
