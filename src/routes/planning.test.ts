/**
 * E2E tests for planning routes (Elysia plugin) — ownership guards on
 * `:id` routes, with focus on the `POST /plans/:id/links` write path.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { PlanLinkRelation, } from "../db/enums-story/plans";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertPlanItems, insertUsers, } from "../test-utils/insert-helpers";
import { planningRoutes, } from "./planning";

/**
 * @param db
 * @param userId
 */
function makeApp(db: Kysely<DB>, userId?: string,) {
  const app = new Elysia({ name: "test-planning", },);
  if (userId) {
    app.derive(() => ({ userId, }));
  }

  return app.use(planningRoutes({ database: db, },),);
}

/**
 * @param id
 * @param toId
 * @param relation
 */
function linkRequest(id: string, toId: string, relation: string,) {
  return new Request(`http://localhost/api/plans/${id}/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: JSON.stringify({ to_id: toId, relation, },),
  },);
}

describe("planningRoutes ownership guards", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
  /** Owned by "user1". */
  let ownItem: string;
  let ownTarget: string;
  /** Owned by "user2" — must be invisible to "user1". */
  let foreignItem: string;
  let foreignTarget: string;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "user1", "User One", { id: "user1" as never, },);
    await insertUsers(db, "user2", "User Two", { id: "user2" as never, },);

    ownItem = await insertPlanItems(db, "user1", "Own Step", { id: "plan-own" as never, },);
    ownTarget = await insertPlanItems(db, "user1", "Own Target", { id: "plan-own-target" as never, },);
    foreignItem = await insertPlanItems(db, "user2", "Foreign Step", { id: "plan-foreign" as never, },);
    foreignTarget = await insertPlanItems(db, "user2", "Foreign Target", {
      id: "plan-foreign-target" as never,
    },);
  },);

  afterAll(() => sqlite.close());

  // ── The IDOR guard that matters ───────────────────────────

  test("POST /plans/:id/links returns 404 when the source :id belongs to another user", async () => {
    const res = await makeApp(db, "user1",).handle(
      linkRequest(foreignItem, ownTarget, PlanLinkRelation.Relates,),
    );

    expect(res.status,).toBe(404,);
  });

  test("POST /plans/:id/links returns 404 when the target to_id belongs to another user", async () => {
    const res = await makeApp(db, "user1",).handle(
      linkRequest(ownItem, foreignTarget, PlanLinkRelation.Relates,),
    );

    expect(res.status,).toBe(404,);
  });

  // `service.addLink` ends in `.returningAll()`, so the route can only answer 201
  // with the created link when the dialect wrapper reports the INSERT as a reader.
  test("POST /plans/:id/links persists the link for owned source and target", async () => {
    const res = await makeApp(db, "user1",).handle(
      linkRequest(ownItem, ownTarget, PlanLinkRelation.Relates,),
    );

    expect(res.status,).toBe(201,);
    const body = (await res.json()) as { from_id: string; to_id: string; relation: string };
    expect(body.from_id,).toBe(ownItem,);
    expect(body.to_id,).toBe(ownTarget,);
    expect(body.relation,).toBe(PlanLinkRelation.Relates,);

    const links = await db
      .selectFrom("plan_links",)
      .selectAll()
      .where("from_id", "=", ownItem,)
      .where("to_id", "=", ownTarget,)
      .execute();

    expect(links.length,).toBe(1,);
    expect(links[0]?.relation,).toBe(PlanLinkRelation.Relates,);
  });

  test("POST /plans/:id/links inserts no row when the source :id is foreign", async () => {
    const links = await db
      .selectFrom("plan_links",)
      .selectAll()
      .where("from_id", "=", foreignItem,)
      .execute();

    expect(links.length,).toBe(0,);
  });

  test("POST /plans/:id/links inserts no row when the target to_id is foreign", async () => {
    const links = await db
      .selectFrom("plan_links",)
      .selectAll()
      .where("to_id", "=", foreignTarget,)
      .execute();

    expect(links.length,).toBe(0,);
  });

  // ── Sibling :id routes ────────────────────────────────────

  test("GET /plans/:id returns 404 for a foreign plan item", async () => {
    const res = await makeApp(db, "user1",).handle(new Request(`http://localhost/api/plans/${foreignItem}`,),);

    expect(res.status,).toBe(404,);
  });

  test("PATCH /plans/:id returns 404 for a foreign plan item", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request(`http://localhost/api/plans/${foreignItem}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ title: "Hijacked", },),
      },),
    );

    expect(res.status,).toBe(404,);
  });

  test("DELETE /plans/:id returns 404 for a foreign plan item", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request(`http://localhost/api/plans/${foreignItem}`, { method: "DELETE", },),
    );

    expect(res.status,).toBe(404,);
  });

  test("POST /plans/:id/advance returns 404 for a foreign plan item", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request(`http://localhost/api/plans/${foreignItem}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ state: "doing", },),
      },),
    );

    expect(res.status,).toBe(404,);
  });

  test("GET /plans/:id/links returns 404 for a foreign plan item", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request(`http://localhost/api/plans/${foreignItem}/links`,),
    );

    expect(res.status,).toBe(404,);
  });
});

// Kysely keeps a statement's rows only when the dialect wrapper reports it as a
// reader. The wrapper now asks SQLite for the statement's result columns, so
// INSERT/UPDATE ... RETURNING come back as rows like any SELECT.
describe("RETURNING-backed writes", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "user1", "User One", { id: "user1" as never, },);
  },);

  afterAll(() => sqlite.close());

  test("INSERT ... RETURNING returns the inserted row", async () => {
    const row = await db
      .insertInto("plan_items",)
      .values({
        id: "ret-1",
        owner_id: "user1",
        title: "Returned",
        state: "todo",
        kind: "step",
        position: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },)
      .returning("id",)
      .executeTakeFirstOrThrow();

    expect(row.id,).toBe("ret-1",);
  });

  test("UPDATE ... RETURNING returns the updated row", async () => {
    const row = await db
      .updateTable("plan_items",)
      .set({ title: "Updated", },)
      .where("id", "=", "ret-1",)
      .returning("title",)
      .executeTakeFirstOrThrow();

    expect(row.title,).toBe("Updated",);
  });

  test("POST /api/plans returns the created item with 201", async () => {
    const req = new Request("http://localhost/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({ title: "Created", },),
    },);

    const res = await makeApp(db, "user1",).handle(req,);

    expect(res.status,).toBe(201,);
    const body = (await res.json()) as { id: string; title: string; state: string };
    expect(body.title,).toBe("Created",);
    expect(body.state,).toBe("todo",);
    expect(typeof body.id,).toBe("string",);
  });

  test("POST /api/plans/:id/advance returns the updated item, not 404", async () => {
    const id = await insertPlanItems(db, "user1", "Advance Me",);
    const req = new Request(`http://localhost/api/plans/${id}/advance`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({ state: "doing", },),
    },);

    const res = await makeApp(db, "user1",).handle(req,);

    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { id: string; state: string };
    expect(body.id,).toBe(id,);
    expect(body.state,).toBe("doing",);
  });

  test("PATCH /api/plans/:id returns the updated item, not 404", async () => {
    const id = await insertPlanItems(db, "user1", "Patch Me",);
    const req = new Request(`http://localhost/api/plans/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({ title: "Renamed", },),
    },);

    const res = await makeApp(db, "user1",).handle(req,);

    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { id: string; title: string };
    expect(body.id,).toBe(id,);
    expect(body.title,).toBe("Renamed",);
  });
});
