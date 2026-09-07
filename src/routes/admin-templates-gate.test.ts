// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression tests for the admin.settings gate on the update/remove
 * admin-template sub-plugins.
 *
 * create/list have always required admin.settings; update/remove did not,
 * so any authenticated caller could PUT/DELETE prompt templates. This
 * suite pins the corrected behavior: non-admin callers get 403, anonymous
 * get 401, and admins still mutate successfully.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { adminTemplateRoutes, } from "./admin-templates/index";

describe("admin-template update/remove gate", () => {
  let db: Kysely<DB>;

  function makeApp(userId: string | null, userRole: string | null,): Elysia {
    return new Elysia({ name: `test-tpl-gate-${userId ?? "anon"}-${userRole ?? "none"}`, },)
      .derive({ as: "scoped", }, () => ({ userId, userRole, }),)
      .use(adminTemplateRoutes({ database: db, },),) as unknown as Elysia;
  }

  let admin: Elysia;
  let user: Elysia;
  let anon: Elysia;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    admin = makeApp("gate-admin", "admin",);
    user = makeApp("gate-user", "user",);
    anon = makeApp(null, null,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("non-admin PUT is rejected with 403", async () => {
    const res = await user.handle(
      new Request("http://localhost/api/admin/templates/sdxl", {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ detail: "balanced", mode: "yourself", template: "x", },),
      },),
    );
    expect(res.status,).toBe(403,);
  });

  test("non-admin PUT defaults is rejected with 403", async () => {
    const res = await user.handle(
      new Request("http://localhost/api/admin/templates/sdxl/defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ cfgScale: 9, },),
      },),
    );
    expect(res.status,).toBe(403,);
  });

  test("non-admin DELETE is rejected with 403", async () => {
    const res = await user.handle(
      new Request("http://localhost/api/admin/templates/sdxl", { method: "DELETE", },),
    );
    expect(res.status,).toBe(403,);
  });

  test("anonymous PUT/DELETE are rejected with 401", async () => {
    const put = await anon.handle(
      new Request("http://localhost/api/admin/templates/sdxl", {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ detail: "balanced", mode: "yourself", template: "x", },),
      },),
    );
    expect(put.status,).toBe(401,);
    const del = await anon.handle(
      new Request("http://localhost/api/admin/templates/sdxl", { method: "DELETE", },),
    );
    expect(del.status,).toBe(401,);
  });

  test("admin PUT still succeeds", async () => {
    const res = await admin.handle(
      new Request("http://localhost/api/admin/templates/sdxl", {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ detail: "balanced", mode: "last", template: "gate-admin-write", },),
      },),
    );
    expect(res.status,).toBe(200,);
  });
});
