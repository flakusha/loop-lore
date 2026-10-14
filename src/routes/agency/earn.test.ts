// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /api/agency/earn — authz + happy-path coverage.
 *
 * The endpoint trusts body.actor_id for which actor's balance to credit.
 * Without an authz check the request is trivial to abuse — any session
 * could inflate another actor's story points. These tests pin the contract:
 *   - unauthenticated requests -> 401
 *   - session.userId !== body.actor_id -> 403
 *   - matching session/actor -> success path
 *   - cap exceeded -> 400
 *   - invalid amount -> 400
 */
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { earnStoryPoints, setStoryPointCap, } from "../../services/agency/story-points";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { agencyEarnRoute, } from "./earn";

function makeApp(db: Kysely<DB>, userId?: string,): Elysia {
  const app = new Elysia({ name: "test-agency-earn", },);
  if (userId !== undefined) { app.derive(() => ({ userId, })); }
  return app.use(agencyEarnRoute({ database: db, }, "/api",),);
}

async function postEarn(app: Elysia, body: Record<string, unknown>,): Promise<Response> {
  return app.handle(
    new Request("http://localhost/api/agency/earn", {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

describe("POST /api/agency/earn — authz", () => {
  test("401 when the session is unauthenticated", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "user-1", "User One",);
    const res = await postEarn(makeApp(db,), { actor_id: "user-1", amount: 3, },);
    expect(res.status,).toBe(401,);
  });

  test("403 when body.actor_id does not match the session user", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "user-1", "User One",);
    await insertUsers(db, "user-2", "User Two",);
    const res = await postEarn(makeApp(db, "user-1",), { actor_id: "user-2", amount: 3, },);
    expect(res.status,).toBe(403,);
  });

  test("200 when body.actor_id matches the session user", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "user-1", "User One",);
    const res = await postEarn(makeApp(db, "user-1",), { actor_id: "user-1", amount: 5, },);
    expect(res.status,).toBe(200,);
    const data = (await res.json()) as { actor_id: string; amount: number; kind: string };
    expect(data.actor_id,).toBe("user-1",);
    expect(data.amount,).toBe(5,);
    expect(data.kind,).toBe("earn",);
  });

  test("422 when amount is not a positive integer", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "user-1", "User One",);
    const res = await postEarn(makeApp(db, "user-1",), { actor_id: "user-1", amount: -1, },);
    expect(res.status,).toBe(422,);
  });

  test("400 when the earn exceeds the cap", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "user-1", "User One",);
    await setStoryPointCap(db, "user-1", null, 3,);
    await earnStoryPoints(db, { actorId: "user-1", amount: 2, },);
    const res = await postEarn(makeApp(db, "user-1",), { actor_id: "user-1", amount: 5, },);
    expect(res.status,).toBe(400,);
  });

  test("world_id scopes the earn to that world", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "user-1", "User One",);
    const res = await postEarn(makeApp(db, "user-1",), { actor_id: "user-1", amount: 7, world_id: "world-9", },);
    expect(res.status,).toBe(200,);
    const data = (await res.json()) as { world_id: string; amount: number };
    expect(data.world_id,).toBe("world-9",);
    expect(data.amount,).toBe(7,);
  });
});
