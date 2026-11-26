// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Regression: the v1 delete path must not remove the last admin. */
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, destroyTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { manageRoutes, } from "./manage";

function makeApp(db: Kysely<DB>,) {
  const app = new Elysia({ name: "test-manage-last-admin", },);
  app.derive((): { userId: string; userRole: string } => ({
    userId: "acting-admin",
    userRole: "admin",
  }));

  return app.use(manageRoutes({ database: db, config: {} as Config, }, "/api",),);
}

describe("manageRoutes last-admin guard", () => {
  test("DELETE /api/users/:id refuses to delete the last admin", async () => {
    const fixture = await createTestDb();
    try {
      const target = await insertUsers(fixture.db, "root", "Root", { role: "admin", },);
      const res = await makeApp(fixture.db,).handle(
        new Request(`http://localhost/api/users/${target}`, { method: "DELETE", },),
      );

      expect(res.status,).toBe(400,);
      const row = await fixture.db.selectFrom("users",).select("id",).where("id", "=", target,).executeTakeFirst();
      expect(row?.id,).toBe(target,);
    } finally {
      await destroyTestDb(fixture,);
    }
  });
});
