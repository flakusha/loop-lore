// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for admin/providers routes including the public GET /api/providers.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
// providers registry intentionally not used; rescan test must work with empty registry
import { providersRoutes, } from "./providers";

/**
 * @param database
 */
function makeApp(database: Kysely<DB>,) {
  const app = new Elysia({ name: "test-providers", },);
  return app.use(providersRoutes({ database, },),);
}

/**
 * @param userRole
 */
function makeAppWithRole(database: Kysely<DB>, userRole: string | null,) {
  const app = new Elysia({ name: "test-providers-role", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId: userRole ? `test-user-${userRole}` : null,
    userRole,
  }));
  return app.use(providersRoutes({ database, },),);
}

/**
 */
const FAKE_NAME = "test-fake-provider";

let db: Kysely<DB>;
let sqlite: Database;

beforeAll(async () => {
  ({ db, sqlite, } = await createTestDb());
},);

afterAll(() => {
  sqlite.close();
},);

describe("providers routes", () => {
  describe("GET /api/providers (public, no auth)", () => {
    test("returns 200 with providers array", async () => {
      const app = makeApp(db,);
      const res = await app.handle(new Request("http://localhost/api/providers",),);
      expect(res.status,).toBe(200,);
      const body = await res.json() as { providers: unknown[] };
      expect(body.providers,).toBeDefined();
      expect(Array.isArray(body.providers,),).toBe(true,);
    });

    test("each provider has name, label, status", async () => {
      const app = makeApp(db,);
      const res = await app.handle(new Request("http://localhost/api/providers",),);
      const body = await res.json() as {
        providers: { name: string; label: string; status: string }[];
      };
      for (const p of body.providers) {
        expect(typeof p.name,).toBe("string",);
        expect(typeof p.label,).toBe("string",);
        expect(["healthy", "unreachable", "error", "unknown",],).toContain(p.status,);
      }
    });

    test("does not require authentication", async () => {
      const app = makeApp(db,);
      const res = await app.handle(
        new Request("http://localhost/api/providers", {
          headers: { Accept: "application/json", },
        },),
      );
      expect(res.status,).toBe(200,);
    });

    test("does not expose model details (only name/label/status)", async () => {
      const app = makeApp(db,);
      const res = await app.handle(new Request("http://localhost/api/providers",),);
      const body = await res.json() as {
        providers: { name: string; label: string; status: string; models?: unknown[] }[];
      };
      for (const p of body.providers) {
        // Public endpoint should NOT expose models array or capabilities
        expect(p.models,).toBeUndefined();
      }
    });
  });

  describe("GET /api/admin/providers (admin only)", () => {
    test("returns 401 for anonymous", async () => {
      const app = makeAppWithRole(db, null,);
      const res = await app.handle(new Request("http://localhost/api/admin/providers",),);
      expect(res.status,).toBe(401,);
    });

    test("returns 403 for non-admin", async () => {
      const app = makeAppWithRole(db, "user",);
      const res = await app.handle(new Request("http://localhost/api/admin/providers",),);
      expect(res.status,).toBe(403,);
    });

    test("returns 403 for moderator", async () => {
      const app = makeAppWithRole(db, "moderator",);
      const res = await app.handle(new Request("http://localhost/api/admin/providers",),);
      expect(res.status,).toBe(403,);
    });

    test("returns 200 with full provider list for admin", async () => {
      const app = makeAppWithRole(db, "admin",);
      const res = await app.handle(new Request("http://localhost/api/admin/providers",),);
      expect(res.status,).toBe(200,);
      const body = await res.json() as {
        providers: { name: string; label: string; capabilities: unknown; status: string }[];
      };
      expect(Array.isArray(body.providers,),).toBe(true,);
      for (const p of body.providers) {
        expect(typeof p.name,).toBe("string",);
        expect(typeof p.label,).toBe("string",);
        expect(p.capabilities,).toBeDefined();
        expect(typeof p.status,).toBe("string",);
      }
    });

    test("exposes capabilities object (admin detail)", async () => {
      const app = makeAppWithRole(db, "admin",);
      const res = await app.handle(new Request("http://localhost/api/admin/providers",),);
      const body = await res.json() as {
        providers: { capabilities: { label?: string } }[];
      };
      const withCaps = body.providers.filter((p,) =>
        p.capabilities !== null && typeof p.capabilities === "object"
      );
      expect(withCaps.length,).toBe(body.providers.length,);
    });
  });

  describe("GET /api/admin/providers/:name/models", () => {
    test("returns 401 for anonymous", async () => {
      const app = makeAppWithRole(db, null,);
      const res = await app.handle(
        new Request(`http://localhost/api/admin/providers/${FAKE_NAME}/models`,),
      );
      expect(res.status,).toBe(401,);
    });

    test("returns 403 for non-admin", async () => {
      const app = makeAppWithRole(db, "user",);
      const res = await app.handle(
        new Request(`http://localhost/api/admin/providers/${FAKE_NAME}/models`,),
      );
      expect(res.status,).toBe(403,);
    });

    test("returns 404 for unknown provider", async () => {
      const app = makeAppWithRole(db, "admin",);
      const res = await app.handle(
        new Request("http://localhost/api/admin/providers/unknown-provider-xyz/models",),
      );
      expect(res.status,).toBe(404,);
    });
  });

  describe("POST /api/admin/providers/rescan", () => {
    test("returns 401 for anonymous", async () => {
      const app = makeAppWithRole(db, null,);
      const res = await app.handle(
        new Request("http://localhost/api/admin/providers/rescan", { method: "POST", },),
      );
      expect(res.status,).toBe(401,);
    });

    test("returns 403 for non-admin", async () => {
      const app = makeAppWithRole(db, "user",);
      const res = await app.handle(
        new Request("http://localhost/api/admin/providers/rescan", { method: "POST", },),
      );
      expect(res.status,).toBe(403,);
    });

    test("returns 403 for moderator", async () => {
      const app = makeAppWithRole(db, "moderator",);
      const res = await app.handle(
        new Request("http://localhost/api/admin/providers/rescan", { method: "POST", },),
      );
      expect(res.status,).toBe(403,);
    });

    test("returns 200 with providers array for admin", async () => {
      const app = makeAppWithRole(db, "admin",);
      const res = await app.handle(
        new Request("http://localhost/api/admin/providers/rescan", { method: "POST", },),
      );
      expect(res.status,).toBe(200,);
      const body = await res.json() as { providers: unknown[] };
      expect(Array.isArray(body.providers,),).toBe(true,);
    });
  });
});
