/**
 * Tests for routes/plugins.ts — Plugin Management Routes
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { dispatchPluginRoute, type ScanAvailablePluginsOpts, } from "../plugins/loader";
import { registry, } from "../plugins/registry";
import { createTestDb, } from "../test-utils/create-test-db";
import { jsonStringifyOr, } from "../utils";
import { pluginRoutes, } from "./plugins";

/**
 * @param db
 * @param userRole
 * @param scanOpts - Scan-root override forwarded to the lifecycle routes.
 */
function createPluginApp(
  db: Kysely<DB>,
  userRole: string,
  scanOpts: ScanAvailablePluginsOpts = {},
): Elysia {
  return new Elysia({ name: "test-plugins", },)
    .derive(() => ({ userRole, }))
    .use(pluginRoutes({ database: db, }, "/api", scanOpts,),) as unknown as Elysia;
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

// ── Lifecycle routes (TASK-plugin-management-api): discover/install/uninstall ──

const FIXTURE_WITH_HOOKS = `export const plugin = {
  name: "mgmt-fixture",
  version: "2.0.0",
  description: "mgmt round-trip fixture",
  author: "test",
  async onLoad() { (globalThis.__mgmtLoaded ??= []).push("mgmt-fixture"); },
  async onUnload() { (globalThis.__mgmtUnloaded ??= []).push("mgmt-fixture"); },
};
`;

const FIXTURE_COLD = `export const plugin = {
  name: "mgmt-cold",
  version: "1.0.0",
  description: "cold uninstall fixture",
  author: "test",
  async onUnload() { (globalThis.__mgmtUnloaded ??= []).push("mgmt-cold"); },
};
`;

const FIXTURE_CORE = `export const plugin = {
  name: "mgmt-core-fixture",
  version: "1.0.0",
  description: "core origin fixture",
  author: "test",
};
`;

const FIXTURE_BROKEN = `throw new Error("broken plugin entry point");
`;

/** */
function mgmtGlobals(): Record<string, unknown> {
  return globalThis as unknown as Record<string, unknown>;
}

/**
 * Write a fixture plugin dir under a temp plugin root.
 * @param root - Temp plugin root directory
 * @param dir - Per-plugin directory name
 * @param code - plugin.ts source
 */
function writeFixture(root: string, dir: string, code: string,): void {
  mkdirSync(join(root, dir,), { recursive: true, },);
  writeFileSync(join(root, dir, "plugin.ts",), code,);
}

/** Temp plugin roots created by the lifecycle suite. */
let communityRoot = "";
let coreRoot = "";

/** Scan roots covering only the suite's temp fixture dirs. */
function fixtureScanOpts(): ScanAvailablePluginsOpts {
  return { roots: [{ origin: "community", dir: communityRoot, }, { origin: "core", dir: coreRoot, },], };
}

/** */
function uninstallMarks(): string[] {
  return (mgmtGlobals().__mgmtUnloaded ?? []) as string[];
}

/** */
function loadMarks(): string[] {
  return (mgmtGlobals().__mgmtLoaded ?? []) as string[];
}

describe("plugin lifecycle routes — discover / install / uninstall", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, } = await createTestDb());
    mgmtGlobals().__mgmtLoaded = [];
    mgmtGlobals().__mgmtUnloaded = [];

    communityRoot = mkdtempSync(join(tmpdir(), "loop-lore-mgmt-community-",),);
    coreRoot = mkdtempSync(join(tmpdir(), "loop-lore-mgmt-core-",),);
    writeFixture(communityRoot, "mgmt-fixture", FIXTURE_WITH_HOOKS,);
    writeFixture(communityRoot, "mgmt-cold", FIXTURE_COLD,);
    writeFixture(communityRoot, "mgmt-broken", FIXTURE_BROKEN,);
    writeFixture(coreRoot, "mgmt-core-fixture", FIXTURE_CORE,);
  },);

  afterAll(async () => {
    registry.unregisterAll();
    rmSync(communityRoot, { recursive: true, force: true, },);
    rmSync(coreRoot, { recursive: true, force: true, },);
    await db.destroy();
  },);

  test("discover lists unregistered on-disk manifests and skips broken dirs", async () => {
    const app = createPluginApp(db, "admin", fixtureScanOpts(),);
    const res = await app.handle(new Request("http://localhost/api/plugins/discover",),);

    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { name: string; origin: string; version: string }[];
    const names = body.map((p,) => p.name);
    expect(names,).toContain("mgmt-fixture",);
    expect(names,).toContain("mgmt-cold",);
    expect(names,).toContain("mgmt-core-fixture",);
    // A throwing entry point is a broken plugin, not a discovery failure.
    expect(names,).not.toContain("mgmt-broken",);

    const fixture = body.find((p,) => p.name === "mgmt-fixture");
    expect(fixture,).toMatchObject({ origin: "community", version: "2.0.0", },);
  });

  test("discover returns 403 for non-admin", async () => {
    const app = createPluginApp(db, "user", fixtureScanOpts(),);
    const res = await app.handle(new Request("http://localhost/api/plugins/discover",),);
    expect(res.status,).toBe(403,);
  });

  test("install returns 403 for non-admin", async () => {
    const app = createPluginApp(db, "user", fixtureScanOpts(),);
    const res = await app.handle(
      new Request("http://localhost/api/plugins/install", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonStringifyOr({ name: "mgmt-fixture", },),
      },),
    );

    expect(res.status,).toBe(403,);
    expect(registry.getPlugin("mgmt-fixture",),).toBeUndefined();
  });

  test("uninstall returns 403 for non-admin", async () => {
    const app = createPluginApp(db, "user", fixtureScanOpts(),);
    const res = await app.handle(
      new Request("http://localhost/api/plugins/mgmt-fixture", { method: "DELETE", },),
    );

    expect(res.status,).toBe(403,);
  });

  test("install returns 404 for an unknown plugin name", async () => {
    const app = createPluginApp(db, "admin", fixtureScanOpts(),);
    const res = await app.handle(
      new Request("http://localhost/api/plugins/install", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonStringifyOr({ name: "no-such-plugin", },),
      },),
    );

    expect(res.status,).toBe(404,);
  });

  test("uninstall returns 404 for an unknown plugin name", async () => {
    const app = createPluginApp(db, "admin", fixtureScanOpts(),);
    const res = await app.handle(
      new Request("http://localhost/api/plugins/no-such-plugin", { method: "DELETE", },),
    );

    expect(res.status,).toBe(404,);
  });

  test("round trip: install persists the origin default, then enable, disable, uninstall", async () => {
    const app = createPluginApp(db, "admin", fixtureScanOpts(),);

    // Install: community origin lands disabled — dropping a dir in can
    // never activate a plugin.
    const installed = await app.handle(
      new Request("http://localhost/api/plugins/install", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonStringifyOr({ name: "mgmt-fixture", },),
      },),
    );

    expect(installed.status,).toBe(200,);
    expect(await installed.json(),).toMatchObject({
      ok: true,
      name: "mgmt-fixture",
      origin: "community",
      enabled: false,
    },);

    expect(registry.getPlugin("mgmt-fixture",),).toBeDefined();
    expect(registry.isEnabled("mgmt-fixture",),).toBe(false,);
    expect(loadMarks(),).not.toContain("mgmt-fixture",);

    const stored = await db
      .selectFrom("plugin_state",)
      .selectAll()
      .where("name", "=", "mgmt-fixture",)
      .executeTakeFirst();

    expect(stored?.status,).toBe("disabled",);

    // Install again → 409: the name is already registered.
    const duplicate = await app.handle(
      new Request("http://localhost/api/plugins/install", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonStringifyOr({ name: "mgmt-fixture", },),
      },),
    );

    expect(duplicate.status,).toBe(409,);

    // Enable runs the deferred onLoad; the state row flips to active.
    const enabled = await app.handle(
      new Request("http://localhost/api/plugins/mgmt-fixture/enable", { method: "POST", },),
    );

    expect(enabled.status,).toBe(200,);
    expect(registry.isEnabled("mgmt-fixture",),).toBe(true,);
    expect(loadMarks(),).toContain("mgmt-fixture",);
    const activeRow = await db
      .selectFrom("plugin_state",)
      .select("status",)
      .where("name", "=", "mgmt-fixture",)
      .executeTakeFirst();

    expect(activeRow?.status,).toBe("active",);

    const disabled = await app.handle(
      new Request("http://localhost/api/plugins/mgmt-fixture/disable", { method: "POST", },),
    );

    expect(disabled.status,).toBe(200,);

    // Uninstall: registration gone, state row gone, onUnload ran once.
    const removed = await app.handle(
      new Request("http://localhost/api/plugins/mgmt-fixture", { method: "DELETE", },),
    );

    expect(removed.status,).toBe(200,);
    expect(registry.getPlugin("mgmt-fixture",),).toBeUndefined();
    expect(uninstallMarks(),).toContain("mgmt-fixture",);
    const goneRow = await db
      .selectFrom("plugin_state",)
      .select("name",)
      .where("name", "=", "mgmt-fixture",)
      .executeTakeFirst();

    expect(goneRow,).toBeUndefined();

    // And it is discoverable again — the directory was never touched.
    const rediscovered = await app.handle(new Request("http://localhost/api/plugins/discover",),);
    expect(rediscovered.status,).toBe(200,);
    const names = (await rediscovered.json()) as { name: string }[];
    expect(names.map((p,) => p.name),).toContain("mgmt-fixture",);
  });

  test("uninstall refuses an enabled plugin with 400 and keeps it registered", async () => {
    const app = createPluginApp(db, "admin", fixtureScanOpts(),);

    const installed = await app.handle(
      new Request("http://localhost/api/plugins/install", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonStringifyOr({ name: "mgmt-fixture", },),
      },),
    );

    expect(installed.status,).toBe(200,);

    const enabled = await app.handle(
      new Request("http://localhost/api/plugins/mgmt-fixture/enable", { method: "POST", },),
    );

    expect(enabled.status,).toBe(200,);

    const refused = await app.handle(
      new Request("http://localhost/api/plugins/mgmt-fixture", { method: "DELETE", },),
    );

    expect(refused.status,).toBe(400,);
    expect(registry.getPlugin("mgmt-fixture",),).toBeDefined();

    const disabled = await app.handle(
      new Request("http://localhost/api/plugins/mgmt-fixture/disable", { method: "POST", },),
    );

    expect(disabled.status,).toBe(200,);

    const removed = await app.handle(
      new Request("http://localhost/api/plugins/mgmt-fixture", { method: "DELETE", },),
    );

    expect(removed.status,).toBe(200,);
    expect(registry.getPlugin("mgmt-fixture",),).toBeUndefined();
  });

  test("cold uninstall of a never-enabled plugin does not call onUnload", async () => {
    const app = createPluginApp(db, "admin", fixtureScanOpts(),);

    const installed = await app.handle(
      new Request("http://localhost/api/plugins/install", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonStringifyOr({ name: "mgmt-cold", },),
      },),
    );

    expect(installed.status,).toBe(200,);

    const removed = await app.handle(
      new Request("http://localhost/api/plugins/mgmt-cold", { method: "DELETE", },),
    );

    expect(removed.status,).toBe(200,);
    // Teardown-without-setup is exactly what the loader avoids.
    expect(uninstallMarks(),).not.toContain("mgmt-cold",);
  });

  test("core-origin install self-approves and lands active", async () => {
    const app = createPluginApp(db, "admin", fixtureScanOpts(),);

    const installed = await app.handle(
      new Request("http://localhost/api/plugins/install", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonStringifyOr({ name: "mgmt-core-fixture", },),
      },),
    );

    expect(installed.status,).toBe(200,);
    expect(await installed.json(),).toMatchObject({
      ok: true,
      name: "mgmt-core-fixture",
      origin: "core",
      enabled: true,
    },);

    expect(registry.isEnabled("mgmt-core-fixture",),).toBe(true,);

    const row = await db
      .selectFrom("plugin_state",)
      .select("status",)
      .where("name", "=", "mgmt-core-fixture",)
      .executeTakeFirst();

    expect(row?.status,).toBe("active",);

    // Disabled-before-uninstall also applies to core plugins.
    const refused = await app.handle(
      new Request("http://localhost/api/plugins/mgmt-core-fixture", { method: "DELETE", },),
    );

    expect(refused.status,).toBe(400,);
  });
});
