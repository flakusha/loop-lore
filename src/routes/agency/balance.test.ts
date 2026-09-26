// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GET /api/agency/balance — the read side of the composer chip.
 *
 * The route is auth-scoped: it reads the session user, never a client-supplied
 * actor id, so a caller can only ever see their own balance. Pinned here:
 *   - unauthenticated -> 401
 *   - session user -> their own balance (+ zero-row bootstrap on first read)
 *   - ?world_id= -> that world's per-world balance, not the global row
 */
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { earnStoryPoints, } from "../../services/agency/story-points";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { agencyBalanceRoute, } from "./balance";

function makeApp(db: Kysely<DB>, userId?: string,): Elysia {
  const app = new Elysia({ name: "test-agency-balance", },);
  if (userId !== undefined) { app.derive(() => ({ userId, })); }
  return app.use(agencyBalanceRoute({ database: db, }, "/api",),);
}

function getBalance(app: Elysia, query = "",): Promise<Response> {
  return app.handle(new Request(`http://localhost/api/agency/balance${query}`,),);
}

describe("GET /api/agency/balance", () => {
  test("401 when the session is unauthenticated", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "user-1", "User One",);
    const res = await getBalance(makeApp(db,),);
    expect(res.status,).toBe(401,);
  });

  test("returns the session user's balance and bootstraps a missing row", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "user-1", "User One",);
    await earnStoryPoints(db, { actorId: "user-1", amount: 4, },);
    const res = await getBalance(makeApp(db, "user-1",),);
    expect(res.status,).toBe(200,);
    const data = (await res.json()) as { actor_id: string; balance: number; cap: number | null };
    expect(data.actor_id,).toBe("user-1",);
    expect(data.balance,).toBe(4,);
  });

  test("returns 0 for an actor with no story-point row yet", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "user-1", "User One",);
    const res = await getBalance(makeApp(db, "user-1",),);
    expect(res.status,).toBe(200,);
    const data = (await res.json()) as { balance: number };
    expect(data.balance,).toBe(0,);
  });

  test("?world_id= reads that world's balance, not the global row", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "user-1", "User One",);
    await insertUsers(db, "user-2", "User Two",);
    await earnStoryPoints(db, { actorId: "user-1", amount: 9, },);
    await earnStoryPoints(db, { actorId: "user-1", worldId: "world-1", amount: 2, },);
    const res = await getBalance(makeApp(db, "user-1",), "?world_id=world-1",);
    expect(res.status,).toBe(200,);
    const data = (await res.json()) as { world_id: string; balance: number };
    expect(data.world_id,).toBe("world-1",);
    expect(data.balance,).toBe(2,);
  });
});
