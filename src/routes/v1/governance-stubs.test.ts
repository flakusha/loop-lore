// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the reserved v1 governance surfaces: auth runs before the stub,
 * and authorized callers get a truthful 501 (not a 404).
 *
 * Resource contract: in-process Elysia app via `app.handle()`, no DB, no
 * port, no global state; every test drives fresh Requests.
 */
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { governanceStubRoutes, } from "./governance-stubs";

function makeApp(userId: string | undefined, userRole: string | null = "user",) {
  return new Elysia({ name: "gov-stubs-test", },)
    .derive(() => ({ userId, userRole, }))
    .use(governanceStubRoutes(),);
}

const AdminRoutes = [
  ["POST", "/api/v1/openapi/validate",],
  ["POST", "/api/v1/openapi/diff",],
  ["GET", "/api/v1/openapi/changelog",],
] as const;

const UserRoutes = [
  ["GET", "/api/v1/tasks",],
  ["GET", "/api/v1/tasks/t-1",],
  ["POST", "/api/v1/tasks/t-1/cancel",],
] as const;

describe("governanceStubRoutes", () => {
  test("admin-only stubs reject anonymous callers with 401", async () => {
    const app = makeApp(undefined,);
    for (const [method, path,] of AdminRoutes) {
      const res = await app.handle(new Request(`http://localhost${path}`, { method, },),);
      expect(res.status,).toBe(401,);
    }
  });

  test("admin-only stubs reject non-admin callers with 403", async () => {
    const app = makeApp("user-stub", "user",);
    for (const [method, path,] of AdminRoutes) {
      const res = await app.handle(new Request(`http://localhost${path}`, { method, },),);
      expect(res.status,).toBe(403,);
    }
  });

  test("admin-only stubs answer 501 NOT_IMPLEMENTED for admins", async () => {
    const app = makeApp("admin-stub", "admin",);
    for (const [method, path,] of AdminRoutes) {
      const res = await app.handle(new Request(`http://localhost${path}`, { method, },),);
      expect(res.status,).toBe(501,);
      const body = await res.json();
      expect(body.code,).toBe("NOT_IMPLEMENTED",);
      expect(body.error,).toContain("reserved",);
    }
  });

  test("task stubs require auth and answer 501 NOT_IMPLEMENTED for users", async () => {
    const anonymous = makeApp(undefined,);
    const authed = makeApp("user-stub", "user",);
    for (const [method, path,] of UserRoutes) {
      expect(
        (await anonymous.handle(new Request(`http://localhost${path}`, { method, },),)).status,
      ).toBe(401,);

      const res = await authed.handle(new Request(`http://localhost${path}`, { method, },),);
      expect(res.status,).toBe(501,);
      expect((await res.json()).code,).toBe("NOT_IMPLEMENTED",);
    }
  });
});
