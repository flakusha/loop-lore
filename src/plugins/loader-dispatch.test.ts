// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { dispatchPluginRoute, registry, unloadAllPlugins, } from "./loader";

beforeEach(() => {
  registry.register({
    manifest: { name: "demo", version: "1", description: "d", author: "t", },
    origin: "local",
    directory: "test",
  },);
});

afterEach(() => {
  registry.unregisterAll();
});

describe("dispatchPluginRoute", () => {
  test("dispatches to matching route and returns its response", async () => {
    registry.addRoutes("demo", [
      {
        method: "GET",
        path: "/plugin/demo",
        handler: async () => new Response("hello",),
      },
    ],);
    const res = await dispatchPluginRoute(new Request("http://localhost/plugin/demo",));
    expect(res?.status,).toBe(200,);
    expect(await res?.text(),).toBe("hello",);
  });

  test("returns null on path or method mismatch", async () => {
    registry.addRoutes("demo", [
      {
        method: "POST",
        path: "/plugin/demo",
        handler: async () => new Response("hello",),
      },
    ],);
    expect(
      await dispatchPluginRoute(new Request("http://localhost/plugin/demo",)),
    ).toBeNull();
    expect(
      await dispatchPluginRoute(new Request("http://localhost/other", { method: "POST", },)),
    ).toBeNull();
  });

  test("skips null-returning routes and falls through", async () => {
    registry.addRoutes("demo", [
      { method: "GET", path: "/x", handler: async () => null, },
      { method: "GET", path: "/x", handler: async () => new Response("second",), },
    ],);
    const res = await dispatchPluginRoute(new Request("http://localhost/x",));
    expect(await res?.text(),).toBe("second",);
  });
});

describe("dispatch respects enabled state", () => {
  test("skips routes of disabled plugins", async () => {
    registry.addRoutes("demo", [
      { method: "GET", path: "/x", handler: async () => new Response("x",), },
    ],);
    registry.setEnabled("demo", false,);
    expect(
      await dispatchPluginRoute(new Request("http://localhost/x",)),
    ).toBeNull();
    expect(registry.getAllRoutes(),).toHaveLength(1,);
    expect(registry.getEnabledRoutes(),).toEqual([],);
  });

  test("unknown plugin names count as disabled", async () => {
    registry.addRoutes("ghost", [
      { method: "GET", path: "/g", handler: async () => new Response("g",), },
    ],);
    expect(
      await dispatchPluginRoute(new Request("http://localhost/g",)),
    ).toBeNull();
  });
});

describe("unloadAllPlugins", () => {
  test("clears all registrations", async () => {
    registry.addRoutes("demo", [
      { method: "GET", path: "/x", handler: async () => new Response("x",), },
    ],);
    await unloadAllPlugins();
    expect(registry.getAllRoutes(),).toEqual([],);
    expect(
      await dispatchPluginRoute(new Request("http://localhost/x",)),
    ).toBeNull();
  });
});
