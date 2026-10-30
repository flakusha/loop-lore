/**
 * Tests for the admin model-news routes.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { newsRoutes, } from "./news";

/**
 * @param db
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userRole: string | null,) {
  const app = new Elysia({ name: "test-news", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId: userRole ? `test-user-${userRole}` : null,
    userRole,
  }));

  return app.use(newsRoutes({ database: db, config: {} as Config, }, "/api",),);
}

let db: Kysely<DB>;
let sqlite: TestDb["sqlite"];

beforeAll(async () => {
  const tdb = await createTestDb();
  db = tdb.db;
  sqlite = tdb.sqlite;
},);

afterAll(() => {
  sqlite.close();
},);

describe("admin model-news routes", () => {
  test("GET returns families array for admin (empty when never polled)", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/model-news",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { families: { family: string; items: unknown[] }[] };
    expect(Array.isArray(body.families,),).toBe(true,);
    expect(body.families.length,).toBe(5,);
    for (const f of body.families) {
      expect(typeof f.family,).toBe("string",);
      expect(Array.isArray(f.items,),).toBe(true,);
    }
  });

  test("GET returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(new Request("http://localhost/api/admin/model-news",),);
    expect(res.status,).toBe(403,);
  });

  test("POST triage flags item dismissed", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/model-news/triage", {
        body: JSON.stringify({ itemId: "x", dismissed: true, },),
        headers: { "Content-Type": "application/json", },
        method: "POST",
      },),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as { itemId: string; dismissed: boolean };
    expect(body.itemId,).toBe("x",);
    expect(body.dismissed,).toBe(true,);
  });

  test("GET weight-change returns false for unknown model", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/model-news/weight-change/nope",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { modelId: string; weightChange: boolean };
    expect(body.modelId,).toBe("nope",);
    expect(body.weightChange,).toBe(false,);
  });
});
