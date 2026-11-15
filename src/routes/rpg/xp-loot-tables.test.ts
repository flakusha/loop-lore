// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Loot-table route tests over a real test DB.
 * The create catch block is unreachable via HTTP (the body schema rejects
 * malformed input with 422 before the handler runs and the service does not
 * throw on schema-valid input).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { uid, } from "../../utils";
import { xpLootTablesRoutes, } from "./xp-loot-tables";

let db: Kysely<DB>;
let sqlite: Database;

beforeAll(async () => {
  ({ db, sqlite, } = await createTestDb());
},);

afterAll(() => sqlite.close());

function authedApp(): Elysia {
  return new Elysia({ name: "test-loot", },)
    .derive({ as: "scoped", }, () => ({ userId: "user1", userRole: "user", }),)
    .use(xpLootTablesRoutes({ database: db, },),) as unknown as Elysia;
}

function anonApp(): Elysia {
  return new Elysia({ name: "test-loot-anon", },)
    .use(xpLootTablesRoutes({ database: db, },),) as unknown as Elysia;
}

/**
 * @param app
 * @param path
 * @param body
 */
function post(app: Elysia, path: string, body?: unknown,): Promise<Response> {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: body === undefined ? undefined : JSON.stringify(body,),
    },),
  );
}

describe("loot table routes", () => {
  test("create requires auth", async () => {
    const res = await post(anonApp(), "/api/rpg/loot/tables", { name: "X", sourceType: "quest", },);
    expect(res.status,).toBe(401,);
  });

  test("create + add entry + roll round-trip", async () => {
    const app = authedApp();
    const created = await post(app, "/api/rpg/loot/tables", { name: "Chest", sourceType: "chest", },);
    expect(created.status,).toBe(200,);
    const { id: tableId, } = await created.json() as { id: string };
    expect(typeof tableId,).toBe("string",);

    const added = await post(app, `/api/rpg/loot/tables/${tableId}/entries`, {
      itemName: "Coin",
      itemType: "junk",
      rarity: "common",
      weight: 1,
      minQuantity: 1,
      maxQuantity: 3,
    },);

    expect(added.status,).toBe(200,);

    const rolled = await post(app, `/api/rpg/loot/tables/${tableId}/roll`,);
    expect(rolled.status,).toBe(200,);
    const result = await rolled.json() as { itemName: string };
    expect(result.itemName,).toBe("Coin",);
  });

  test("add entry requires auth", async () => {
    const res = await post(anonApp(), `/api/rpg/loot/tables/${uid()}/entries`, {
      itemName: "X",
      itemType: "junk",
      rarity: "common",
      weight: 1,
    },);

    expect(res.status,).toBe(401,);
  });

  test("roll requires auth", async () => {
    const res = await post(anonApp(), `/api/rpg/loot/tables/${uid()}/roll`,);
    expect(res.status,).toBe(401,);
  });

  test("roll of a missing table is 404", async () => {
    const res = await post(authedApp(), `/api/rpg/loot/tables/${uid()}/roll`,);
    expect(res.status,).toBe(404,);
  });

  test("roll of an empty table is 404", async () => {
    const app = authedApp();
    const created = await post(app, "/api/rpg/loot/tables", { name: "Empty", sourceType: "none", },);
    const { id: tableId, } = await created.json() as { id: string };
    const res = await post(app, `/api/rpg/loot/tables/${tableId}/roll`,);
    expect(res.status,).toBe(404,);
  });
});
