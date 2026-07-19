/**
 * Tests for routes/plugins.ts — Plugin Management Routes
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { registry, } from "../plugins/registry";
import { createTestDb, } from "../test-utils/create-test-db";
import { pluginRoutes, } from "./plugins";

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
    const body = (await res.json()) as unknown[];
    expect(Array.isArray(body,),).toBe(true,);
    expect(body[0],).toHaveProperty("name", "test-plugin",);
    expect(body[0],).toHaveProperty("enabled", true,);
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
    const body = await res.text();
    console.log("enable response:", res.status, body,);
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
    const body = await res.text();
    console.log("disable response:", res.status, body,);
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
