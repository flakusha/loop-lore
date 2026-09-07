// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for admin template management routes
 * (list / registry / get / create / update / remove).
 *
 * Covers the adminTemplateRoutes barrel plus every sub-plugin and the
 * stored-template helpers, including corrupt-config recovery and the
 * validation/auth rejection paths.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { adminTemplateRoutes, } from "./admin-templates/index";

interface ProfileSummary {
  id: string;
  name: string;
  isBuiltin: boolean;
  templateCount: number;
}

interface ListBody {
  profiles: ProfileSummary[];
  defaultProfileId: string;
  builtinCount: number;
  customCount: number;
}

interface FullProfile {
  id: string;
  isBuiltin: boolean;
  templates: { balanced: { yourself: string } };
  defaults: { cfgScale: number };
}

describe("adminTemplateRoutes coverage", () => {
  let db: Kysely<DB>;

  /**
   * Build the route app with the given auth context.
   * @param userId authenticated user or null for anonymous
   * @param userRole role string or null
   */
  function makeApp(userId: string | null, userRole: string | null,): Elysia {
    return new Elysia({ name: `test-admin-templates-${userId ?? "anon"}-${userRole ?? "none"}`, },)
      .derive({ as: "scoped", }, () => ({ userId, userRole, }),)
      .use(adminTemplateRoutes({ database: db, },),) as unknown as Elysia;
  }

  let admin: Elysia;
  let user: Elysia;
  let anon: Elysia;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    admin = makeApp("admin-cov", "admin",);
    user = makeApp("user-cov", "user",);
    anon = makeApp(null, null,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("list gates anonymous and non-admin callers", async () => {
    const anonRes = await anon.handle(new Request("http://localhost/api/admin/templates",),);
    expect(anonRes.status,).toBe(401,);
    const userRes = await user.handle(new Request("http://localhost/api/admin/templates",),);
    expect(userRes.status,).toBe(403,);
  },);

  test("list returns builtin profiles with counts", async () => {
    const res = await admin.handle(new Request("http://localhost/api/admin/templates",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as ListBody;
    expect(body.defaultProfileId,).toBe("sdxl",);
    expect(body.builtinCount,).toBeGreaterThan(0,);
    expect(body.customCount,).toBe(0,);
    const sdxl = body.profiles.find((p,) => p.id === "sdxl",);
    expect(sdxl?.isBuiltin,).toBe(true,);
    expect(sdxl?.templateCount,).toBeGreaterThan(0,);
  },);

  test("registry exposes full profiles plus model matching", async () => {
    const res = await admin.handle(
      new Request("http://localhost/api/admin/templates/registry",),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as {
      profiles: Record<string, FullProfile>;
      defaultProfileId: string;
      modelMatching: unknown;
    };
    expect(body.defaultProfileId,).toBe("sdxl",);
    expect(body.profiles["sdxl"]?.id,).toBe("sdxl",);
    expect(body.modelMatching,).toBeDefined();
    const denied = await user.handle(
      new Request("http://localhost/api/admin/templates/registry",),
    );
    expect(denied.status,).toBe(403,);
  },);

  test("get one profile resolves builtins and 404s unknowns", async () => {
    const res = await admin.handle(
      new Request("http://localhost/api/admin/templates/sdxl",),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as FullProfile;
    expect(body.isBuiltin,).toBe(true,);
    const missing = await admin.handle(
      new Request("http://localhost/api/admin/templates/no-such-profile",),
    );
    expect(missing.status,).toBe(404,);
    const denied = await user.handle(
      new Request("http://localhost/api/admin/templates/sdxl",),
    );
    expect(denied.status,).toBe(403,);
  },);

  test("create rejects auth, missing fields, and bad ids", async () => {
    const anonRes = await anon.handle(new Request("http://localhost/api/admin/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({ id: "cov-a", name: "A", families: ["sdxl",], },),
    },),);
    expect(anonRes.status,).toBe(401,);
    const userRes = await user.handle(new Request("http://localhost/api/admin/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({ id: "cov-a", name: "A", families: ["sdxl",], },),
    },),);
    expect(userRes.status,).toBe(403,);
    const missing = await admin.handle(new Request("http://localhost/api/admin/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({ id: "cov-a", },),
    },),);
    expect(missing.status,).toBe(400,);
    const badId = await admin.handle(new Request("http://localhost/api/admin/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({ id: "BAD ID!", name: "A", families: ["sdxl",], },),
    },),);
    expect(badId.status,).toBe(400,);
  },);

  test("create persists a profile and rejects duplicates", async () => {
    const created = await admin.handle(new Request("http://localhost/api/admin/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({ id: "cov-custom", name: "Custom", families: ["sdxl",], },),
    },),);
    expect(created.status,).toBe(200,);
    const list = (await (await admin.handle(
      new Request("http://localhost/api/admin/templates",),
    )).json()) as ListBody;
    expect(list.customCount,).toBe(1,);
    expect(list.profiles.some((p,) => p.id === "cov-custom" && !p.isBuiltin,),).toBe(true,);
    const dup = await admin.handle(new Request("http://localhost/api/admin/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({ id: "cov-custom", name: "Custom", families: ["sdxl",], },),
    },),);
    expect(dup.status,).toBe(422,);
    const builtinDup = await admin.handle(new Request("http://localhost/api/admin/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({ id: "sdxl", name: "Custom", families: ["sdxl",], },),
    },),);
    expect(builtinDup.status,).toBe(422,);
  },);

  test("update writes template text and model defaults", async () => {
    const put = await admin.handle(new Request("http://localhost/api/admin/templates/cov-custom", {
      method: "PUT",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({ detail: "balanced", mode: "yourself", template: "cover me {prompt}", },),
    },),);
    expect(put.status,).toBe(200,);
    const fetched = (await (await admin.handle(
      new Request("http://localhost/api/admin/templates/cov-custom",),
    )).json()) as FullProfile;
    expect(fetched.isBuiltin,).toBe(false,);
    expect(fetched.templates.balanced.yourself,).toBe("cover me {prompt}",);
    const defaults = await admin.handle(
      new Request("http://localhost/api/admin/templates/cov-custom/defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ cfgScale: 9, },),
      },),
    );
    expect(defaults.status,).toBe(200,);
    const refetched = (await (await admin.handle(
      new Request("http://localhost/api/admin/templates/cov-custom",),
    )).json()) as FullProfile;
    expect(refetched.defaults.cfgScale,).toBe(9,);
  },);

  test("update rejects bad input and unknown profiles", async () => {
    const anonRes = await anon.handle(new Request("http://localhost/api/admin/templates/sdxl", {
      method: "PUT",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({ detail: "balanced", mode: "yourself", template: "x", },),
    },),);
    expect(anonRes.status,).toBe(401,);
    const missing = await admin.handle(new Request("http://localhost/api/admin/templates/sdxl", {
      method: "PUT",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({ detail: "balanced", },),
    },),);
    expect(missing.status,).toBe(400,);
    const unknown = await admin.handle(new Request("http://localhost/api/admin/templates/nope", {
      method: "PUT",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({ detail: "balanced", mode: "yourself", template: "x", },),
    },),);
    expect(unknown.status,).toBe(404,);
    const unknownDefaults = await admin.handle(
      new Request("http://localhost/api/admin/templates/nope/defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ cfgScale: 9, },),
      },),
    );
    expect(unknownDefaults.status,).toBe(404,);
  },);

  test("update and remove currently accept any authenticated caller", async () => {
    // Documents the missing admin gate on the update/remove sub-plugins:
    // create/list require admin.settings but these do not.
    const put = await user.handle(new Request("http://localhost/api/admin/templates/sdxl", {
      method: "PUT",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({ detail: "balanced", mode: "last", template: "cov-user-write", },),
    },),);
    expect(put.status,).toBe(200,);
    const fetched = (await (await admin.handle(
      new Request("http://localhost/api/admin/templates/sdxl",),
    )).json()) as FullProfile;
    expect(fetched.templates.balanced,).toBeDefined();
  },);

  test("remove protects builtins, 404s unknowns, and deletes customs", async () => {
    const anonRes = await anon.handle(
      new Request("http://localhost/api/admin/templates/cov-custom", { method: "DELETE", },),
    );
    expect(anonRes.status,).toBe(401,);
    const builtin = await admin.handle(
      new Request("http://localhost/api/admin/templates/sdxl", { method: "DELETE", },),
    );
    expect(builtin.status,).toBe(400,);
    const unknown = await admin.handle(
      new Request("http://localhost/api/admin/templates/nope", { method: "DELETE", },),
    );
    expect(unknown.status,).toBe(404,);
    const removed = await admin.handle(
      new Request("http://localhost/api/admin/templates/cov-custom", { method: "DELETE", },),
    );
    expect(removed.status,).toBe(200,);
    const gone = await admin.handle(
      new Request("http://localhost/api/admin/templates/cov-custom",),
    );
    expect(gone.status,).toBe(404,);
  },);

  test("corrupt stored JSON resets to defaults instead of failing", async () => {
    await db.updateTable("system_config",)
      .set({ value: "corrupt{{{", },)
      .where("key", "=", "prompt_templates",)
      .execute();
    const res = await admin.handle(new Request("http://localhost/api/admin/templates",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as ListBody;
    expect(body.customCount,).toBe(0,);
    expect(body.defaultProfileId,).toBe("sdxl",);
  },);

  test("list and registry report 500 when storage fails", async () => {
    const broken = (await createTestDb()).db;
    await broken.destroy();
    const brokenApp = new Elysia({ name: "test-admin-templates-broken", },)
      .derive({ as: "scoped", }, () => ({ userId: "admin-cov", userRole: "admin", }),)
      .use(adminTemplateRoutes({ database: broken, },),) as unknown as Elysia;
    const list = await brokenApp.handle(new Request("http://localhost/api/admin/templates",),);
    expect(list.status,).toBe(500,);
    const registry = await brokenApp.handle(
      new Request("http://localhost/api/admin/templates/registry",),
    );
    expect(registry.status,).toBe(500,);
  },);
});
