// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `RouteDefinition.requiresAuth` / `.permissions` are enforced by
 * `dispatchPluginRoute` (see ./route-access). These assert observable HTTP
 * behaviour through the real dispatch entry point, plus the invariant that
 * matters most for backward compatibility: a route declaring neither field is
 * still served to an anonymous caller.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { dispatchPluginRoute, registry, unloadAllPlugins, } from "./loader";
import { checkRouteAccess, } from "./route-access";

let calls = 0;

beforeEach(() => {
  calls = 0;
  registry.register({
    manifest: { name: "demo", version: "1", description: "d", author: "t", },
    origin: "local",
    directory: "test",
  },);
});

afterEach(() => {
  registry.unregisterAll();
});

/** Handler that records invocation and answers 200. */
function okHandler(body: string,) {
  return async (): Promise<Response> => {
    calls += 1;
    return new Response(body,);
  };
}

describe("requiresAuth", () => {
  beforeEach(() => {
    registry.addRoutes("demo", [
      { method: "GET", path: "/secret", handler: okHandler("secret"), requiresAuth: true, },
    ],);
  });

  test("401s an anonymous caller and never invokes the handler", async () => {
    const res = await dispatchPluginRoute({ request: new Request("http://x/secret",), },);

    expect(res?.status,).toBe(401,);
    expect(calls,).toBe(0,);
  });

  test("401s a caller with a null userId even when a role is present", async () => {
    const res = await dispatchPluginRoute({
      request: new Request("http://x/secret",),
      caller: { userId: null, userRole: "admin", },
    },);

    expect(res?.status,).toBe(401,);
    expect(calls,).toBe(0,);
  });

  test("serves an authenticated regular user", async () => {
    const res = await dispatchPluginRoute({
      request: new Request("http://x/secret",),
      caller: { userId: "u-1", userRole: "user", },
    },);

    expect(res?.status,).toBe(200,);
    expect(await res?.text(),).toBe("secret",);
    expect(calls,).toBe(1,);
  });

  test("serves an authenticated admin", async () => {
    const res = await dispatchPluginRoute({
      request: new Request("http://x/secret",),
      caller: { userId: "a-1", userRole: "admin", },
    },);

    expect(res?.status,).toBe(200,);
    expect(calls,).toBe(1,);
  });
});

describe("permissions", () => {
  beforeEach(() => {
    registry.addRoutes("demo", [
      {
        method: "GET",
        path: "/admin-only",
        handler: okHandler("admin data"),
        permissions: ["admin.settings",],
      },
    ],);
  });

  test("403s an unauthorized authenticated caller and never invokes the handler", async () => {
    const res = await dispatchPluginRoute({
      request: new Request("http://x/admin-only",),
      caller: { userId: "u-1", userRole: "user", },
    },);

    expect(res?.status,).toBe(403,);
    expect(calls,).toBe(0,);
  });

  test("403s an anonymous caller", async () => {
    const res = await dispatchPluginRoute({
      request: new Request("http://x/admin-only",),
    },);

    expect(res?.status,).toBe(403,);
    expect(calls,).toBe(0,);
  });

  test("serves a caller holding the permission", async () => {
    const res = await dispatchPluginRoute({
      request: new Request("http://x/admin-only",),
      caller: { userId: "a-1", userRole: "admin", },
    },);

    expect(res?.status,).toBe(200,);
    expect(await res?.text(),).toBe("admin data",);
    expect(calls,).toBe(1,);
  });

  test("requires every declared permission", async () => {
    registry.unregisterAll();
    registry.register({
      manifest: { name: "demo", version: "1", description: "d", author: "t", },
      origin: "local",
      directory: "test",
    },);

    registry.addRoutes("demo", [
      {
        method: "GET",
        path: "/two-perms",
        handler: okHandler("nope"),
        permissions: ["moderation.review", "admin.settings",],
      },
    ],);

    const moderator = await dispatchPluginRoute({
      request: new Request("http://x/two-perms",),
      caller: { userId: "m-1", userRole: "moderator", },
    },);

    expect(moderator?.status,).toBe(403,);
    expect(calls,).toBe(0,);

    const admin = await dispatchPluginRoute({
      request: new Request("http://x/two-perms",),
      caller: { userId: "a-1", userRole: "admin", },
    },);

    expect(admin?.status,).toBe(200,);
    expect(calls,).toBe(1,);
  });
});

describe("routes declaring neither field stay public", () => {
  test("serves an anonymous caller", async () => {
    registry.addRoutes("demo", [
      { method: "GET", path: "/public", handler: okHandler("open"), },
    ],);

    const res = await dispatchPluginRoute({ request: new Request("http://x/public",), },);

    expect(res?.status,).toBe(200,);
    expect(await res?.text(),).toBe("open",);
    expect(calls,).toBe(1,);
  });

  test("an explicit requiresAuth:false stays public", async () => {
    registry.addRoutes("demo", [
      { method: "GET", path: "/open2", handler: okHandler("open2"), requiresAuth: false, },
    ],);

    const res = await dispatchPluginRoute({ request: new Request("http://x/open2",), },);

    expect(res?.status,).toBe(200,);
    expect(calls,).toBe(1,);
  });

  test("an empty permissions array does not lock the route", async () => {
    registry.addRoutes("demo", [
      { method: "GET", path: "/open3", handler: okHandler("open3"), permissions: [], },
    ],);

    const res = await dispatchPluginRoute({ request: new Request("http://x/open3",), },);

    expect(res?.status,).toBe(200,);
    expect(calls,).toBe(1,);
  });
});

/**
 * The `caller` argument is the only way a handler can do row-level
 * authorization. Without it a `requiresAuth`-only route is an IDOR waiting to
 * happen, so prove it actually arrives.
 */
describe("handler receives the resolved caller", () => {
  test("forwards the identity to a two-argument handler", async () => {
    const seen: unknown[] = [];
    registry.addRoutes("demo", [
      {
        method: "GET",
        path: "/me",
        handler: async (_req, caller) => { seen.push(caller,); return new Response("ok",); },
        requiresAuth: true,
      },
    ],);

    const res = await dispatchPluginRoute({
      request: new Request("http://x/me",),
      caller: { userId: "u-42", userRole: "user", },
    },);

    expect(res?.status,).toBe(200,);
    expect(seen,).toEqual([{ userId: "u-42", userRole: "user", },],);
  },);

  test("an anonymous request reaches a one-arg handler unchanged", async () => {
    const seen: unknown[] = [];
    registry.addRoutes("demo", [
      {
        method: "GET",
        path: "/anon",
        handler: async () => { seen.push("legacy-one-arg",); return new Response("ok",); },
      },
      {
        method: "GET",
        path: "/anon2",
        handler: async (_req, caller) => { seen.push(caller,); return new Response("ok",); },
      },
    ],);

    const legacy = await dispatchPluginRoute({ request: new Request("http://x/anon",), },);
    const twoArg = await dispatchPluginRoute({ request: new Request("http://x/anon2",), },);

    expect(legacy?.status,).toBe(200,);
    expect(twoArg?.status,).toBe(200,);
    // One-arg handlers stay valid; `caller` is undefined when none was threaded.
    expect(seen,).toEqual(["legacy-one-arg", undefined,],);
  },);
});

/**
 * N4: the denial body must be localised like every other route's. `t` is the
 * same `ctx.t` the auth derive already builds, forwarded untouched through
 * handleApiRequest -> dispatchPluginRoute. Without it these bodies silently
 * fall back to hardcoded English while the rest of the API is translated.
 */
describe("denial bodies are localised", () => {
  const fakeT = (key: string,) => {
    return "de:" + key + ":";
  };

  test("401 body uses the translator", async () => {
    registry.addRoutes("demo", [
      { method: "GET", path: "/priv", handler: async () => new Response("x"), requiresAuth: true, },
    ],);

    const res = await dispatchPluginRoute({
      request: new Request("http://x/priv",),
      caller: { userId: null, userRole: null, },
      t: fakeT,
    },);

    expect(res?.status,).toBe(401,);
    expect(await res?.json(),).toMatchObject({ error: "de:errors.unauthorized:", },);
  },);

  test("403 body uses the translator", async () => {
    registry.addRoutes("demo", [
      {
        method: "GET",
        path: "/admin",
        handler: async () => new Response("x"),
        permissions: ["admin.settings",],
      },
    ],);

    const res = await dispatchPluginRoute({
      request: new Request("http://x/admin",),
      caller: { userId: "u1", userRole: "user", },
      t: fakeT,
    },);

    expect(res?.status,).toBe(403,);
    expect(await res?.json(),).toMatchObject({ error: "de:errors.forbidden:", },);
  },);

  test("falls back to English when no translator is threaded", async () => {
    registry.addRoutes("demo", [
      { method: "GET", path: "/priv", handler: async () => new Response("x"), requiresAuth: true, },
    ],);

    const res = await dispatchPluginRoute({ request: new Request("http://x/priv",), },);

    expect(await res?.json(),).toMatchObject({ error: "Unauthorized", },);
  },);
});

describe("unloadAllPlugins", () => {
  test("clears registrations", async () => {
    registry.addRoutes("demo", [
      { method: "GET", path: "/x", handler: okHandler("x"), },
    ],);

    await unloadAllPlugins();
    expect(registry.getAllRoutes(),).toEqual([],);
    expect(
      await dispatchPluginRoute({ request: new Request("http://x/x",), },),
    ).toBeNull();
  },);
});

/**
 * `checkRouteAccess` is the exported unit; every block above reaches it only
 * through `dispatchPluginRoute`, which can observe the resulting HTTP status
 * but not the contract the dispatcher branches on. These call it directly to
 * pin that contract: a `Response` on denial and `null` on allow, the 401 gate
 * returning before the permission matrix is consulted, and the two falsy
 * guards that stop an undeclared field from ever reaching `hasAll`.
 */
describe("checkRouteAccess", () => {
  /** Minimal route definition — only the access fields vary per test. */
  function route(access: { requiresAuth?: boolean; permissions?: string[]; }) {
    return {
      method: "GET" as const,
      path: "/direct",
      handler: okHandler("direct"),
      ...access,
    };
  }

  const req = () => new Request("http://x/direct",);

  test("returns null — not a Response — when the route declares neither field", () => {
    const denial = checkRouteAccess({ route: route({}), request: req(), },);

    expect(denial,).toBeNull();
  });

  test("returns null for a caller that satisfies both gates", () => {
    const denial = checkRouteAccess({
      route: route({ requiresAuth: true, permissions: ["admin.settings",], },),
      request: req(),
      caller: { userId: "a-1", userRole: "admin", },
    },);

    expect(denial,).toBeNull();
  });

  test("returns a 401 Response when `caller` is omitted entirely", () => {
    const denial = checkRouteAccess({
      route: route({ requiresAuth: true, },),
      request: req(),
    },);

    expect(denial,).toBeInstanceOf(Response,);
    expect(denial?.status,).toBe(401,);
  });

  test("401 short-circuits before the permission check runs", async () => {
    const denial = checkRouteAccess({
      route: route({ requiresAuth: true, permissions: ["admin.settings",], },),
      request: req(),
      caller: { userId: null, userRole: "user", },
    },);

    // `user` does not hold admin.settings, so a permission-first ordering would
    // answer 403. The auth gate returns first, and the body says nothing about
    // which permission failed.
    expect(denial?.status,).toBe(401,);
    expect(await denial?.json(),).toMatchObject({ error: "Unauthorized", },);
  });

  test("an authenticated caller with no role is forbidden, not unauthenticated", () => {
    const denial = checkRouteAccess({
      route: route({ permissions: ["admin.settings",], },),
      request: req(),
      caller: { userId: "u-1", userRole: null, },
    },);

    // `can(null, ...)` is false, so a real userId without a role is a 403.
    expect(denial?.status,).toBe(403,);
  });

  test("requiresAuth is compared to `true`, so an explicit false never denies", () => {
    const denial = checkRouteAccess({
      route: route({ requiresAuth: false, permissions: ["admin.settings",], },),
      request: req(),
      caller: { userId: null, userRole: "user", },
    },);

    // Only the permission gate is live here, and `user` does not hold it.
    expect(denial?.status,).toBe(403,);
  });

  test("an empty permissions array never reaches hasAll", () => {
    const denial = checkRouteAccess({
      route: route({ permissions: [], },),
      request: req(),
      caller: { userId: null, userRole: null, },
    },);

    // `hasAll(null, [])` is vacuously true, so the `.length` guard is the only
    // thing keeping a role-less anonymous caller on the allow path.
    expect(denial,).toBeNull();
  });

  test("localises the 401 through the threaded translator", async () => {
    const denial = checkRouteAccess({
      route: route({ requiresAuth: true, },),
      request: req(),
      t: (key: string,) => "de:" + key + ":",
    },);

    expect(await denial?.json(),).toMatchObject({ error: "de:errors.unauthorized:", },);
  });

  test("localises the 403 through the threaded translator", async () => {
    const denial = checkRouteAccess({
      route: route({ permissions: ["admin.settings",], },),
      request: req(),
      caller: { userId: "u-1", userRole: "user", },
      t: (key: string,) => "de:" + key + ":",
    },);

    expect(await denial?.json(),).toMatchObject({ error: "de:errors.forbidden:", },);
  });
});
