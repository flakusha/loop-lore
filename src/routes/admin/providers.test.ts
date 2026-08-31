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
import { providersRoutes, } from "./providers";

let db: Kysely<DB>;
let sqlite: Database;

beforeAll(async () => {
  ({ db, sqlite, } = await createTestDb());
},);

afterAll(() => {
  sqlite.close();
},);

/**
 * @param database
 */
function makeApp(database: Kysely<DB>,) {
  const app = new Elysia({ name: "test-providers", },);
  return app.use(providersRoutes({ database, },),);
}

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
      // No userRole or session headers — should still return 200
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
});
