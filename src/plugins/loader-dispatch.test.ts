// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { getLogger, setGlobalLogger, type Logger, } from "../logger";
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

    const res = await dispatchPluginRoute({
      request: new Request("http://localhost/plugin/demo",),
    },);

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
      await dispatchPluginRoute({ request: new Request("http://localhost/plugin/demo",), },),
    ).toBeNull();

    expect(
      await dispatchPluginRoute({
        request: new Request("http://localhost/other", { method: "POST", },),
      },),
    ).toBeNull();
  });

  test("skips null-returning routes and falls through", async () => {
    registry.addRoutes("demo", [
      { method: "GET", path: "/x", handler: async () => null, },
      { method: "GET", path: "/x", handler: async () => new Response("second",), },
    ],);

    const res = await dispatchPluginRoute({
      request: new Request("http://localhost/x",),
    },);

    expect(await res?.text(),).toBe("second",);
  });
});

// BUG-fix-plugins-define-plugin-route-matching-semantics: matching semantics
// are exact-normalized-path only — :param paths are rejected at registration,
// trailing slashes collapse on both sides, and duplicate method+path
// registrations warn instead of silently pinning dispatch order.
describe("plugin route matching semantics", () => {
  test("rejects :param paths at registration with a clear error", () => {
    expect(() =>
      registry.addRoutes("demo", [
        { method: "GET", path: "/plugin/:id", handler: async () => new Response("no",), },
      ],),
    ).toThrow(/:param segment/);

    // The rejected def never lands in the registry.
    expect(registry.getPluginRoutes("demo",).map((r,) => r.path,),).not.toContain("/plugin/:id",);
  });

  test("a :param request path can never match a plugin route", async () => {
    registry.addRoutes("demo", [
      { method: "GET", path: "/plugin/list", handler: async () => new Response("ok",), },
    ],);

    expect(
      await dispatchPluginRoute({ request: new Request("http://localhost/plugin/123",), },),
    ).toBeNull();
  });

  test("trailing slashes normalize on registration and dispatch", async () => {
    registry.addRoutes("demo", [
      { method: "GET", path: "/plugin/widget/", handler: async () => new Response("w",), },
    ],);

    // Registration stored the normalized path (one canonical key).
    expect(registry.getPluginRoutes("demo",).map((r,) => r.path,),).toEqual(["/plugin/widget",],);

    const bare = await dispatchPluginRoute({ request: new Request("http://localhost/plugin/widget",), },);
    const trailing = await dispatchPluginRoute({ request: new Request("http://localhost/plugin/widget/",), },);
    expect(await bare?.text(),).toBe("w",);
    expect(await trailing?.text(),).toBe("w",);
  });

  test("duplicate method+path registration warns loudly", () => {
    const warnings: string[] = [];
    const stub: Logger = {
      trace() {},
      debug() {},
      info() {},
      warn(message,) { warnings.push(String(message,),); },
      error() {},
      fatal() {},
      child() {
        return stub;
      },
      addTransport() {},
      setBindings() {},
      setLevel() {},
      async flush() {},
    };

    registry.addRoutes("demo", [
      { method: "GET", path: "/dup", handler: async () => new Response("first",), },
    ],);

    const previous = getLogger();
    setGlobalLogger(stub,);
    try {
      registry.addRoutes("demo", [
        { method: "GET", path: "/dup", handler: async () => new Response("second",), },
      ],);
    } finally {
      setGlobalLogger(previous,);
    }

    expect(warnings.some((w,) => w.includes("GET /dup") && w.includes("already registered",),),).toBe(true,);
  });
});

describe("dispatch respects enabled state", () => {
  test("skips routes of disabled plugins", async () => {
    registry.addRoutes("demo", [
      { method: "GET", path: "/x", handler: async () => new Response("x",), },
    ],);

    registry.setEnabled("demo", false,);
    expect(
      await dispatchPluginRoute({ request: new Request("http://localhost/x",), },),
    ).toBeNull();

    expect(registry.getAllRoutes(),).toHaveLength(0,);
    expect(registry.getEnabledRoutes(),).toEqual([],);
  });

  test("rejects routes without registered plugin provenance", async () => {
    expect(() => registry.addRoutes("ghost", [
      { method: "GET", path: "/g", handler: async () => new Response("g",), },
    ],)).toThrow("unregistered plugin");

    expect(
      await dispatchPluginRoute({ request: new Request("http://localhost/g",), },),
    ).toBeNull();
  });
});

describe("unregister", () => {
  test("drops one plugin's routes from dispatch and leaves the others serving", async () => {
    registry.register({
      manifest: { name: "other", version: "1", description: "d", author: "t", },
      origin: "local",
      directory: "test",
    },);

    registry.addRoutes("demo", [
      { method: "GET", path: "/x", handler: async () => new Response("x",), },
    ],);

    registry.addRoutes("other", [
      { method: "GET", path: "/y", handler: async () => new Response("y",), },
    ],);

    registry.unregister("demo",);

    expect(registry.getPlugin("demo",),).toBeUndefined();
    expect(registry.getAllRoutes(),).toHaveLength(1,);
    expect(
      await dispatchPluginRoute({ request: new Request("http://localhost/x",), },),
    ).toBeNull();

    const res = await dispatchPluginRoute({ request: new Request("http://localhost/y",), },);
    expect(await res?.text(),).toBe("y",);
  },);
});

describe("unloadAllPlugins", () => {
  test("clears all registrations", async () => {
    registry.addRoutes("demo", [
      { method: "GET", path: "/x", handler: async () => new Response("x",), },
    ],);

    await unloadAllPlugins();
    expect(registry.getAllRoutes(),).toEqual([],);
    expect(
      await dispatchPluginRoute({ request: new Request("http://localhost/x",), },),
    ).toBeNull();
  });
});
