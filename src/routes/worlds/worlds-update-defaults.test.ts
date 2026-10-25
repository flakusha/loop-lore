// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * A partial world update must leave the fields it omits alone.
 *
 * `t.Optional(t.UnionEnum([...]))` bakes `default` into the compiled schema
 * (its first member), so Elysia's parse used to force-set an omitted
 * `kind`/`visibility` to "rpg"/"public" — every partial update silently
 * reset both columns and undid the world's privacy setting. The update body
 * now uses default-free literal unions.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import type { HandleOpts, } from "./types";
import { worldRoutes, } from "./worlds-routes";

const BASE = "http://localhost";

/**
 * @param db
 * @param userId
 * @param userRole
 */
function appWithAuth(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-worlds-update-defaults", },)
    .derive(() => ({ userId, userRole, }))
    .use(worldRoutes({ database: db, config: {} as Config, } as HandleOpts,),) as unknown as Elysia;
}

describe("PUT /api/worlds/:worldId — omitted fields stay untouched", () => {
  let db: Kysely<DB>;
  let sqlite: Awaited<ReturnType<typeof createTestDb>>["sqlite"];
  let ownerId: string;
  let worldId: string;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());

    ownerId = uid();
    await insertUsers(db, "owner", "Owner", { id: ownerId, } as never,);
    worldId = uid();
    await insertWorlds(db, ownerId, "Defaults Realm", { id: worldId, } as never,);
    await db
      .updateTable("worlds",)
      .set({ kind: "chat", visibility: "unlisted", },)
      .where("id", "=", worldId,)
      .execute();
  },);

  afterAll(async () => {
    await sqlite.close();
  },);

  /**
   * @param body
   * @returns the raw PUT response
   */
  async function put(body: Record<string, unknown>,): Promise<Response> {
    return await appWithAuth(db, ownerId, "user",).handle(
      new Request(`${BASE}/api/worlds/${worldId}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify(body,),
      },),
    );
  }

  /**
   * @returns the stored kind/visibility columns
   */
  async function readKindVisibility(): Promise<{ kind: string; visibility: string }> {
    const row = await db
      .selectFrom("worlds",)
      .select(["kind", "visibility",],)
      .where("id", "=", worldId,)
      .executeTakeFirstOrThrow();

    return { kind: row.kind, visibility: row.visibility, };
  }

  test("an update that omits kind/visibility leaves both columns alone", async () => {
    const res = await put({ description: "Only the description moves.", },);

    expect(res.status,).toBe(200,);
    expect(await readKindVisibility(),).toEqual({ kind: "chat", visibility: "unlisted", },);
  });

  test("an update that names kind/visibility still writes them", async () => {
    const res = await put({ kind: "rpg", visibility: "private", },);

    expect(res.status,).toBe(200,);
    expect(await readKindVisibility(),).toEqual({ kind: "rpg", visibility: "private", },);
  });

  test("an unknown kind is still rejected with 422", async () => {
    const res = await put({ kind: "bogus", },);

    expect(res.status,).toBe(422,);
    expect(await readKindVisibility(),).toEqual({ kind: "rpg", visibility: "private", },);
  });

  test("an unknown visibility is still rejected with 422", async () => {
    const res = await put({ visibility: "shiny", },);

    expect(res.status,).toBe(422,);
    expect(await readKindVisibility(),).toEqual({ kind: "rpg", visibility: "private", },);
  });
});
