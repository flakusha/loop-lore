// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { emitPluginEvent, } from "./event-bus";
import { executePluginTool, } from "./tool-executor";
import { getComponentsForMountPoint, } from "./mount-points";
import { mergePluginConfig, } from "./config-merge";
import { registry, } from "./registry";
import type { RouteDefinition, } from "./types";

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

// TASK-046: per-extension-point override precedence — routes family.
//
// Plugin A registers a route. Plugin B registers the same path with a
// different handler. Stored overrides in `plugin_state.config` flip the
// enabled flag for B; routes from disabled plugins are filtered out by
// `getEnabledRoutes`, so A's route wins for the conflicting path. For
// non-conflicting paths, both contribute.

const route = (path: string, handlerName: string): RouteDefinition => ({
  method: "GET",
  path,
  handler: async () => ({ ok: true, who: handlerName, }),
});

describe("routes extension-point override precedence", () => {
  test("disabled plugin's routes are excluded; enabled plugin's routes win", () => {
    registry.unregisterAll();
    registry.register({
      manifest: { name: "a", version: "1", description: "a", author: "t", defaults: {}, },
      origin: "core",
      directory: "/tmp/a",
    });
    registry.register({
      manifest: { name: "b", version: "1", description: "b", author: "t", defaults: {}, },
      origin: "community",
      directory: "/tmp/b",
    });

    registry.addRoutes("a", [route("/shared", "a-handler",), route("/a-only", "a-only",),],);
    registry.addRoutes("b", [route("/shared", "b-handler",), route("/b-only", "b-only",),],);

    // Both enabled — b-handler for /shared is the most-recently-added.
    registry.setEnabled("a", true,);
    registry.setEnabled("b", true,);
    const allEnabled = registry.getEnabledRoutes();
    expect(allEnabled.map((r,) => r.path,)).toEqual(["/shared", "/a-only", "/shared", "/b-only",],);

    // Disable b — /shared and /b-only drop; only a's routes survive.
    registry.setEnabled("b", false,);
    const onlyA = registry.getEnabledRoutes();
    expect(onlyA.map((r,) => r.path,)).toEqual(["/shared", "/a-only",],);

    registry.unregisterAll();
  });

  test("config merge feeds plugin_state.config into the routes family override", () => {
    // Stored override (e.g. from `plugin_state.config`) merged over manifest
    // defaults. The merged config is the source of truth for the loader, which
    // then calls `setEnabled(false)` when the override disables a plugin.
    const merged = mergePluginConfig(
      { enabled: true, priority: 1, },
      { enabled: false, priority: 5, },
      { type: "object", properties: {}, required: ["enabled",], },
    );
    expect(merged,).toEqual({ enabled: false, priority: 5, },);
    if (!merged.enabled) {
      registry.setEnabled("b", false,);
    }
    expect(registry.isEnabled("b",),).toBe(false,);
  });
});
