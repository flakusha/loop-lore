// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Multi-location sectioning tests for `PUT /api/chats/:id/location`.
 *
 * A successful in-chat location change must leave a journey section bound to
 * the destination (no-op when the latest section already covers it), matching
 * the transfer route. Clearing the location creates nothing.
 *
 * Parallel-safety: every test builds its own private DB via createTestDb()
 * and destroys it before returning; ids are file-scoped random UUIDs.
 */
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertChats,
  insertLocations,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { extrasRoutes, } from "./extras";
import type { HandlerOpts, } from "./types";

const OWNER_ID = randomUUID();
const WORLD_ID = randomUUID();
const CHAT_ID = randomUUID();
const TAVERN_ID = randomUUID();
const FOREST_ID = randomUUID();

/** Build the extras route app with a fixed session identity injected. */
function makeApp(db: Kysely<DB>, userId: string,) {
  const config = createConfigSchema().defaults as Config;
  return new Elysia()
    // `user` role keeps the owners-set guard authoritative (no admin bypass).
    .derive(() => ({ userId, userRole: "user", }))
    .use(extrasRoutes({ database: db, config, } as unknown as HandlerOpts,),);
}

/** Seed an owner user + world-bound chat with two locations in its world. */
async function seed(db: Kysely<DB>,): Promise<void> {
  await insertUsers(db, `owner-${OWNER_ID}`, "Owner", { id: OWNER_ID, } as never,);
  await insertWorlds(db, OWNER_ID, "World", { id: WORLD_ID, } as never,);
  await insertChats(db, "Journey", OWNER_ID, {
    id: CHAT_ID,
    world_id: WORLD_ID,
  } as never,);

  await insertLocations(db, WORLD_ID, "Tavern", { id: TAVERN_ID, } as never,);
  await insertLocations(db, WORLD_ID, "Forest", { id: FOREST_ID, } as never,);
}

/** PUT helper for the location endpoint. */
function putLocation(db: Kysely<DB>, body: unknown,) {
  return makeApp(db, OWNER_ID,).handle(
    new Request(`http://localhost/api/chats/${CHAT_ID}/location`, {
      method: "PUT",
      headers: { "content-type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

/** PUT helper that asserts the expected status before returning. */
async function putLocationExpect(db: Kysely<DB>, body: unknown, status: number,): Promise<void> {
  const res = await putLocation(db, body,);
  expect(res.status,).toBe(status,);
}

async function sectionLocations(db: Kysely<DB>,): Promise<(string | null)[]> {
  const rows = await db
    .selectFrom("chat_sections",)
    .select("location_id",)
    .where("chat_id", "=", CHAT_ID,)
    .orderBy("sort_index", "asc",)
    .execute();

  return rows.map((r,) => r.location_id);
}

describe("extrasRoutes — PUT /location section creation (multi-location sectioning)", () => {
  test("creates a journey section bound to the destination", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await putLocation(db, { locationId: TAVERN_ID, },);
    expect(res.status,).toBe(200,);
    expect(await sectionLocations(db,),).toEqual([TAVERN_ID,],);

    await db.destroy();
  });

  test("moves append sections in order and dedupe the latest location", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    await putLocationExpect(db, { locationId: TAVERN_ID, }, 200,);
    await putLocationExpect(db, { locationId: FOREST_ID, }, 200,);
    await putLocationExpect(db, { locationId: FOREST_ID, }, 200,);

    expect(await sectionLocations(db,),).toEqual([TAVERN_ID, FOREST_ID,],);

    await db.destroy();
  });

  test("clearing the location creates no section", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    await putLocationExpect(db, { locationId: TAVERN_ID, }, 200,);
    await putLocationExpect(db, { locationId: null, }, 200,);

    expect(await sectionLocations(db,),).toEqual([TAVERN_ID,],);

    await db.destroy();
  });
});
