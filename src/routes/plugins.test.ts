/**
 * Tests for routes/plugins.ts — Plugin Management Routes
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { dispatchPluginRoute, } from "../plugins/loader";
import { registry, } from "../plugins/registry";
import { createTestDb, } from "../test-utils/create-test-db";
import { jsonStringifyOr, } from "../utils";
import { pluginRoutes, } from "./plugins";

/**
 * @param db
 * @param userRole
 */
function createPluginApp(db: Kysely<DB>, userRole: string,): Elysia {
  return new Elysia({ name: "test-plugins", },)
    .derive(() => ({ userRole, }))
    .use(pluginRoutes({ database: db, },),) as unknown as Elysia;
}

describe("GET /api/plugins", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, } = await createTestDb());

    registry.register({
      manifest: {
        name: "test-plugin",
        version: "1.0.0",
        description: "A test plugin",
        author: "test",
      },
      origin: "core",
      directory: "/tmp",
    },);

    registry.setEnabled("test-plugin", true,);
  },);

  afterAll(async () => {
    registry.unregisterAll();
    await db.destroy();
  },);

  test("returns 403 for non-admin", async () => {
    const app = createPluginApp(db, "user",);
    const res = await app.handle(new Request("http://localhost/api/plugins",),);
    expect(res.status,).toBe(403,);
  });

  test("lists plugins for admin", async () => {
    const app = createPluginApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/plugins",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { name: string; enabled: boolean }[];
    expect(Array.isArray(body,),).toBe(true,);
    const plugin = body.find((p,) => p.name === "test-plugin");
    expect(plugin,).toBeDefined();
    expect(plugin!.enabled,).toBe(true,);
  });
});

describe("POST /api/plugins/:name/enable", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, } = await createTestDb());
    registry.register({
      manifest: { name: "disable-me", version: "1.0", description: "", author: "test", },
      origin: "core",
      directory: "/tmp",
    },);

    registry.setEnabled("disable-me", false,);
  },);

  afterAll(async () => {
    registry.unregisterAll();
    await db.destroy();
  },);

  test("returns 403 for non-admin", async () => {
    const app = createPluginApp(db, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/plugins/disable-me/enable", { method: "POST", },),
    );

    expect(res.status,).toBe(403,);
  });

  test("enables a disabled plugin", async () => {
    const app = createPluginApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/plugins/disable-me/enable", { method: "POST", },),
    );

    expect(res.status,).toBe(200,);
    expect(registry.isEnabled("disable-me",),).toBe(true,);
  });

  test("returns 400 for already enabled plugin", async () => {
    const app = createPluginApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/plugins/disable-me/enable", { method: "POST", },),
    );

    expect(res.status,).toBe(400,);
  });
});

describe("POST /api/plugins/:name/disable", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, } = await createTestDb());
    registry.register({
      manifest: { name: "enable-me", version: "1.0", description: "", author: "test", },
      origin: "core",
      directory: "/tmp",
    },);

    registry.setEnabled("enable-me", true,);
  },);

  afterAll(async () => {
    registry.unregisterAll();
    await db.destroy();
  },);

  test("disables an enabled plugin", async () => {
    const app = createPluginApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/plugins/enable-me/disable", { method: "POST", },),
    );

    expect(res.status,).toBe(200,);
    expect(registry.isEnabled("enable-me",),).toBe(false,);
  });

  test("returns 400 for already disabled plugin", async () => {
    const app = createPluginApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/plugins/enable-me/disable", { method: "POST", },),
    );

    expect(res.status,).toBe(400,);
  });

  test("returns 404 for unknown plugin", async () => {
    const app = createPluginApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/plugins/unknown/disable", { method: "POST", },),
    );

    expect(res.status,).toBe(404,);
  });
});

describe("POST /api/plugins/:name/enable — deferred onLoad", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, } = await createTestDb());
    // Stands in for a plugin that loaded while unapproved: registered, but
    // its `onLoad` never ran, so it has no dynamic route yet.
    registry.register({
      manifest: {
        name: "deferred-plugin",
        version: "1.0",
        description: "",
        author: "test",
        async onLoad(ctx,) {
          ctx.registerApiRoute({
            method: "GET",
            path: "/deferred/dynamic",
            handler: async () => new Response("dynamic",),
          },);
        },
      },
      origin: "community",
      directory: "/tmp",
    },);

    registry.setEnabled("deferred-plugin", false,);
  },);

  afterAll(async () => {
    registry.unregisterAll();
    await db.destroy();
  },);

  test("a plugin that never ran onLoad serves nothing while disabled", async () => {
    expect(registry.getPluginRoutes("deferred-plugin",),).toEqual([],);
    expect(
      await dispatchPluginRoute({ request: new Request("http://localhost/deferred/dynamic",), },),
    ).toBeNull();
  });

  test("enabling runs the deferred onLoad so its route now dispatches", async () => {
    const app = createPluginApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/plugins/deferred-plugin/enable", { method: "POST", },),
    );

    expect(res.status,).toBe(200,);
    expect(registry.isEnabled("deferred-plugin",),).toBe(true,);
    expect(registry.getPluginRoutes("deferred-plugin",).map((r,) => r.path),).toContain("/deferred/dynamic",);
    const dispatched = await dispatchPluginRoute({ request: new Request("http://localhost/deferred/dynamic",), },);
    expect(dispatched,).not.toBeNull();
    expect(await dispatched?.text(),).toBe("dynamic",);
  });

  test("the enable is persisted as active", async () => {
    const row = await db
      .selectFrom("plugin_state",)
      .select("status",)
      .where("name", "=", "deferred-plugin",)
      .executeTakeFirst();

    expect(row?.status,).toBe("active",);
  });

  test("a throwing onLoad leaves the plugin disabled and returns 500", async () => {
    registry.register({
      manifest: {
        name: "boom-plugin",
        version: "1.0",
        description: "",
        author: "test",
        async onLoad() {
          throw new Error("hook failed",);
        },
      },
      origin: "community",
      directory: "/tmp",
    },);

    registry.setEnabled("boom-plugin", false,);

    const app = createPluginApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/plugins/boom-plugin/enable", { method: "POST", },),
    );

    expect(res.status,).toBe(500,);
    expect(registry.isEnabled("boom-plugin",),).toBe(false,);
  });
});

describe("plugin routes — edge cases", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, } = await createTestDb());
    registry.register({
      manifest: { name: "edge-test", version: "1.0", description: "", author: "test", },
      origin: "core",
      directory: "/tmp",
    },);

    registry.setEnabled("edge-test", false,);
  },);

  afterAll(async () => {
    registry.unregisterAll();
    await db.destroy();
  },);

  test("enable returns 404 for unknown plugin name", async () => {
    const app = createPluginApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/plugins/does-not-exist/enable", { method: "POST", },),
    );

    expect(res.status,).toBe(404,);
  });

  test("enable returns 400 for already-enabled plugin", async () => {
    registry.setEnabled("edge-test", true,);
    const app = createPluginApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/plugins/edge-test/enable", { method: "POST", },),
    );

    expect(res.status,).toBe(400,);
  });

  test("oversized plugin name in URL path does not crash", async () => {
    const app = createPluginApp(db, "admin",);
    const huge = "p".repeat(2048,);
    const res = await app.handle(
      new Request(`http://localhost/api/plugins/${huge}/enable`, { method: "POST", },),
    );

    expect([400, 404,],).toContain(res.status,);
  });

  test("list endpoint tolerates many registrations", async () => {
    for (let i = 0; i < 50; i++) {
      registry.register({
        manifest: { name: `bulk-${i}`, version: "1.0", description: "", author: "test", },
        origin: "core",
        directory: "/tmp",
      },);
    }

    const app = createPluginApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/plugins",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as unknown[];
    expect(body.length,).toBeGreaterThanOrEqual(50,);
  });
});

describe("plugin config routes (FEAT-051)", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, } = await createTestDb());
    registry.register({
      manifest: {
        name: "cfg-plugin",
        version: "1.0",
        description: "",
        author: "test",
        config: { theme: "dark", },
        configSchema: { type: "object", properties: {}, required: ["token",], },
      },
      origin: "core",
      directory: "/tmp",
    },);

    registry.setEnabled("cfg-plugin", true,);
  },);

  afterAll(async () => {
    registry.unregisterAll();
    await db.destroy();
  },);

  test("GET returns 403 for non-admin", async () => {
    const app = createPluginApp(db, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/plugins/cfg-plugin/config",),
    );

    expect(res.status,).toBe(403,);
  });

  test("GET returns 404 for unknown plugin", async () => {
    const app = createPluginApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/plugins/no-such-plugin/config",),
    );

    expect(res.status,).toBe(404,);
  });

  test("PUT returns 403 for non-admin", async () => {
    const app = createPluginApp(db, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/plugins/cfg-plugin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonStringifyOr({ token: "x", },),
      },),
    );

    expect(res.status,).toBe(403,);
  });

  test("PUT returns 404 for unknown plugin", async () => {
    const app = createPluginApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/plugins/no-such-plugin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonStringifyOr({ token: "x", },),
      },),
    );

    expect(res.status,).toBe(404,);
  });

  test("PUT returns 400 when a required key is missing", async () => {
    const app = createPluginApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/plugins/cfg-plugin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonStringifyOr({},),
      },),
    );

    expect(res.status,).toBe(400,);
  });

  test("round-trips a valid config through PUT then GET", async () => {
    const app = createPluginApp(db, "admin",);
    const put = await app.handle(
      new Request("http://localhost/api/plugins/cfg-plugin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonStringifyOr({ token: "s3cret", },),
      },),
    );

    expect(put.status,).toBe(200,);

    const get = await app.handle(
      new Request("http://localhost/api/plugins/cfg-plugin/config",),
    );

    expect(get.status,).toBe(200,);
    const body = (await get.json()) as { config: Record<string, unknown> };
    expect(body.config,).toEqual({ token: "s3cret", },);
  });
});

describe("GET /api/plugins/ui-components", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, } = await createTestDb());
    registry.register({
      manifest: { name: "ui-plugin", version: "1.0", description: "", author: "test", },
      origin: "core",
      directory: "/tmp",
    },);

    registry.addUIComponents("ui-plugin", [
      { type: "web", name: "sidebar-widget", location: "chat.sidebar", props: { label: "Hi", }, },
      { type: "both", name: "composer-widget", location: "chat.composer", },
      { type: "tui", name: "tui-widget", location: "chat.sidebar", },
    ],);
  },);

  afterAll(async () => {
    registry.unregisterAll();
    await db.destroy();
  },);

  test("returns 403 for non-admin", async () => {
    const app = createPluginApp(db, "user",);
    const res = await app.handle(new Request("http://localhost/api/plugins/ui-components",),);
    expect(res.status,).toBe(403,);
  });

  test("lists all registered components for admin (tui included by design)", async () => {
    const app = createPluginApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/plugins/ui-components",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as {
      name: string;
      location: string;
      type: string;
      props: Record<string, unknown>;
    }[];

    const names = body.map((c,) => c.name);
    expect(names,).toContain("sidebar-widget",);
    expect(names,).toContain("composer-widget",);
    expect(names,).toContain("tui-widget",);
    const widget = body.find((c,) => c.name === "sidebar-widget");
    expect(widget!.location,).toBe("chat.sidebar",);
    expect(widget!.type,).toBe("web",);
    expect(widget!.props,).toEqual({ label: "Hi", },);
  });

  test("filters by ?location=", async () => {
    const app = createPluginApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/plugins/ui-components?location=chat.composer",),
    );

    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { name: string }[];
    expect(body.map((c,) => c.name),).toEqual(["composer-widget",],);
  });

  test("unknown location returns an empty list", async () => {
    const app = createPluginApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/plugins/ui-components?location=nope.here",),
    );

    expect(res.status,).toBe(200,);
    expect(await res.json(),).toEqual([],);
  });

  test("empty ?location= value is treated as no filter", async () => {
    const app = createPluginApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/plugins/ui-components?location=",),
    );

    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { name: string }[];
    expect(body.map((c,) => c.name),).toContain("sidebar-widget",);
  });
});
