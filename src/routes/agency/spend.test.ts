// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /api/agency/spend -- authz coverage.
 *
 * The endpoint trusts body.actor_id for which actor's balance to debit.
 * Without an authz check the request is trivial to abuse -- any session
 * could drain another actor's story points. These tests pin the contract:
 *   - unauthenticated requests -> 401
 *   - session.userId !== body.actor_id -> 403
 *   - matching session/actor -> success path
 *
 * Mirrors the pattern in activity-stream.test.ts: a minimal Elysia app
 * that derives ctx.userId from the test harness, then mounts the route.
 */
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";

import { type Kysely, sql, } from "kysely";
import type { DB, } from "../../db/schema";
import { earnStoryPoints, } from "../../services/agency/story-points";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { agencySpendRoute, } from "./spend";

function makeApp(db: Kysely<DB>, userId?: string,): Elysia {
  const app = new Elysia({ name: "test-agency-spend", },);
  if (userId !== undefined) { app.derive(() => ({ userId, })); }
  return app.use(agencySpendRoute({ database: db, }, "/api",),);
}

async function postSpend(app: Elysia, body: Record<string, unknown>,): Promise<Response> {
  return app.handle(
    new Request("http://localhost/api/agency/spend", {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

describe("POST /api/agency/spend -- authz", () => {
  test("401 when the session is unauthenticated", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "user-1", "User One",);
    await earnStoryPoints(db, { actorId: "user-1", amount: 10, },);
    const app = makeApp(db,);
    const res = await postSpend(app, { actor_id: "user-1", amount: 1, reason: "reroll", },);
    expect(res.status,).toBe(401,);
  });

  test("403 when body.actor_id does not match the session user", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "user-1", "User One",);
    await insertUsers(db, "user-2", "User Two",);
    await earnStoryPoints(db, { actorId: "user-1", amount: 10, },);
    await earnStoryPoints(db, { actorId: "user-2", amount: 10, },);
    const app = makeApp(db, "user-1",);
    const res = await postSpend(app, { actor_id: "user-2", amount: 1, reason: "reroll", },);
    expect(res.status,).toBe(403,);
  });

  test("200 when body.actor_id matches the session user", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "user-1", "User One",);
    await earnStoryPoints(db, { actorId: "user-1", amount: 10, },);
    const app = makeApp(db, "user-1",);
    const res = await postSpend(app, { actor_id: "user-1", amount: 3, reason: "reroll", },);
    expect(res.status,).toBe(200,);
    const data = (await res.json()) as { balance: number; spent_total: number };
    expect(data.balance,).toBe(7,);
    expect(data.spent_total,).toBe(3,);
  });

  test("400 when the spend exceeds the available balance", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "user-1", "User One",);
    await earnStoryPoints(db, { actorId: "user-1", amount: 2, },);
    const app = makeApp(db, "user-1",);
    const res = await postSpend(app, { actor_id: "user-1", amount: 5, reason: "reroll", },);
    expect(res.status,).toBe(400,);
    const data = (await res.json()) as { error: string };
    expect(data.error,).toMatch(/Not enough story points \(have 2, need 5\)/,);
  });

  test("400 when amount is not a positive integer", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "user-1", "User One",);
    const app = makeApp(db, "user-1",);
    // The t.Object body schema (t.Integer({minimum:1})) rejects this before the
    // handler runs, so the route never sees amount <= 0.
    const res = await postSpend(app, { actor_id: "user-1", amount: 0, reason: "reroll", },);
    expect(res.status,).toBe(422,);
  });

  test("500 when the spend service fails unexpectedly", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "user-1", "User One",);
    await earnStoryPoints(db, { actorId: "user-1", amount: 5, },);
    // Drop the table so the service's SELECT raises a real SQL error and the
    // route's catch-all (not the typed Insufficient branch) is exercised.
    await sql`DROP TABLE actor_story_points`.execute(db,);
    const app = makeApp(db, "user-1",);
    const res = await postSpend(app, { actor_id: "user-1", amount: 1, reason: "reroll", },);
    expect(res.status,).toBe(500,);
    const data = (await res.json()) as { error: string };
    expect(data.error,).toMatch(/^spend failed: /,);
  });
});
