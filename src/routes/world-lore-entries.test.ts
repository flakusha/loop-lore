/**
 * Unit tests for world-lore-entries routes (Elysia plugin)
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import type { Db, } from "../db";
import type { DB, } from "../db/schema";
import { createTestDb, type TestDb, } from "../test-utils/create-test-db";
import { insertUsers, insertWorlds, } from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { worldLoreEntriesRoutes, } from "./world-lore-entries";

// Smoke fixtures: the plugin only forwards these to `createEntityRoutes`.
const mockDb = {} as Db;
const mockConfig = {} as Config;

describe("worldLoreEntriesRoutes", () => {
  test("exports function", () => {
    expect(typeof worldLoreEntriesRoutes,).toBe("function",);
  });

  test("returns Elysia plugin", () => {
    const plugin = worldLoreEntriesRoutes({ database: mockDb, config: mockConfig, },);
    expect(plugin,).toBeDefined();
  });
});

// ── ownership contract (real DB + real routes) ──────────────────
//
// Resource contract: this file owns exactly ONE resource — an in-memory
// SQLite database created in `beforeAll` and closed in `afterAll`
// (`bun test --isolate` runs each file in its own process, so no two files
// share it). Every test builds its OWN worlds and lore entries under fresh
// `uid()` ids, so no test reads or mutates another test's rows: each test
// passes alone, in any order, and repeatedly under `--rerun-each`.

/** View of a lore-entry row as returned by the CRUD routes. */
interface LoreEntryPayload {
  id: string;
  world_id: string;
  name: string | null;
  content: string;
}

/** Paginated list envelope. */
interface ListPayload {
  data: LoreEntryPayload[];
  pagination: { total: number; page: number; pageSize: number };
}

/** Error envelope. */
interface ErrorPayload {
  error: string;
  code?: string;
}

/**
 * Mount the lore-entries plugin with injected auth, mirroring how the app
 * derives `userId`/`userRole` in front of route registration.
 * @param db - test database
 * @param userId - acting user id
 * @param userRole - acting user role
 */
function makeApp(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-world-lore-entries", },)
    .derive(() => ({ userId, userRole, }))
    .use(worldLoreEntriesRoutes({ database: db, config: {} as Config, },),) as unknown as Elysia;
}

/**
 * Per-test world fixture — a private world nobody else writes to.
 * @param db - test database
 * @param ownerId - owning user id
 * @returns the new world id
 */
async function seedWorld(db: Kysely<DB>, ownerId: string,): Promise<string> {
  const id = uid();
  await insertWorlds(db, ownerId, `World ${id}`, { id, },);
  return id;
}

/**
 * Per-test lore-entry fixture, inserted directly so a test can start from a
 * pre-existing row without going through the routes under test.
 * @param db - test database
 * @param worldId - owning world id
 * @param content - entry body
 * @returns the new entry id
 */
async function seedEntry(db: Kysely<DB>, worldId: string, content: string,): Promise<string> {
  const id = uid();
  await db.insertInto("world_lore_entries",).values({ id, world_id: worldId, content, },).execute();
  return id;
}

/**
 * Entry ids currently stored for a world (sorted for deterministic compares).
 * @param db - test database
 * @param worldId - world to inspect
 */
async function entryIdsOf(db: Kysely<DB>, worldId: string,): Promise<string[]> {
  const rows = await db
    .selectFrom("world_lore_entries",)
    .select(["id",],)
    .where("world_id", "=", worldId,)
    .execute();
  return rows.map((r,) => r.id).sort();
}

/**
 * POST a lore entry and return the parsed response.
 * @param db - test database
 * @param userId - acting user id
 * @param userRole - acting user role
 * @param worldId - target world id
 * @param body - create payload
 */
async function postEntry(
  db: Kysely<DB>,
  userId: string | null,
  userRole: string | null,
  worldId: string,
  body: { name?: string; content: string },
): Promise<{ res: Response; body: LoreEntryPayload | ErrorPayload }> {
  const res = await makeApp(db, userId, userRole,).handle(
    new Request(`http://localhost/api/worlds/${worldId}/lore-entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
  return { res, body: (await res.json()) as LoreEntryPayload | ErrorPayload, };
}

describe("worldLoreEntriesRoutes — ownership", () => {
  let db: Kysely<DB>;
  let sqlite: TestDb["sqlite"];

  const ownerId = uid();
  const otherId = uid();

  beforeAll(async () => {
    const tdb = await createTestDb();
    db = tdb.db;
    sqlite = tdb.sqlite;

    await insertUsers(db, `owner-${ownerId}`, "World Owner", { id: ownerId, },);
    await insertUsers(db, `other-${otherId}`, "Other User", { id: otherId, },);
  },);

  afterAll(() => {
    sqlite.close();
  },);

  test("owner lists own world's lore entries", async () => {
    const worldId = await seedWorld(db, ownerId,);
    const res = await makeApp(db, ownerId, "user",).handle(
      new Request(`http://localhost/api/worlds/${worldId}/lore-entries`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as ListPayload;
    expect(body.data,).toBeInstanceOf(Array,);
    expect(body.data,).toHaveLength(0,);
    expect(body.pagination.total,).toBe(0,);
    expect(body.pagination.page,).toBe(1,);
  });

  test("owner creates a lore entry and reads it back", async () => {
    const worldId = await seedWorld(db, ownerId,);
    const { res, body, } = await postEntry(db, ownerId, "user", worldId, {
      name: "Ash Gate",
      content: "The gate opens at dusk.",
    },);
    expect(res.status,).toBe(201,);
    const created = body as LoreEntryPayload;
    expect(created.name,).toBe("Ash Gate",);
    expect(created.content,).toBe("The gate opens at dusk.",);
    expect(created.world_id,).toBe(worldId,);

    const row = await db
      .selectFrom("world_lore_entries",)
      .select(["id", "world_id", "name", "content",],)
      .where("id", "=", created.id,)
      .executeTakeFirst();
    expect(row?.world_id,).toBe(worldId,);
    expect(row?.content,).toBe("The gate opens at dusk.",);

    const listRes = await makeApp(db, ownerId, "user",).handle(
      new Request(`http://localhost/api/worlds/${worldId}/lore-entries`,),
    );
    const listed = (await listRes.json()) as ListPayload;
    expect(listed.pagination.total,).toBe(1,);
    expect(listed.data.map((e,) => e.id),).toEqual([created.id,],);
  });

  test("owner reads a single lore entry by id", async () => {
    const worldId = await seedWorld(db, ownerId,);
    const entryId = await seedEntry(db, worldId, "The gate opens at dusk.",);

    const res = await makeApp(db, ownerId, "user",).handle(
      new Request(`http://localhost/api/worlds/${worldId}/lore-entries/${entryId}`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as LoreEntryPayload;
    expect(body.id,).toBe(entryId,);
    expect(body.content,).toBe("The gate opens at dusk.",);
  });

  test("non-owner cannot list another user's world lore entries", async () => {
    // The world is populated, so a 404 can only come from the ownership check.
    const worldId = await seedWorld(db, otherId,);
    await seedEntry(db, worldId, "Hidden lore",);

    const res = await makeApp(db, ownerId, "user",).handle(
      new Request(`http://localhost/api/worlds/${worldId}/lore-entries`,),
    );
    expect(res.status,).toBe(404,);
    const body = (await res.json()) as ErrorPayload;
    expect(body.error,).toBe("Lore entry not found",);
    expect(body.code,).toBe("NOT_FOUND",);
  });

  test("non-owner cannot create in another user's world", async () => {
    const worldId = await seedWorld(db, otherId,);

    const { res, body, } = await postEntry(db, ownerId, "user", worldId, { content: "Intruder", },);
    expect(res.status,).toBe(404,);
    expect((body as ErrorPayload).error,).toBe("Lore entry not found",);
    expect(await entryIdsOf(db, worldId,),).toHaveLength(0,);
  });

  test("non-owner cannot delete another user's lore entry", async () => {
    const worldId = await seedWorld(db, otherId,);
    const entryId = await seedEntry(db, worldId, "Hidden lore",);

    const res = await makeApp(db, ownerId, "user",).handle(
      new Request(`http://localhost/api/worlds/${worldId}/lore-entries/${entryId}`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(404,);
    const body = (await res.json()) as ErrorPayload;
    expect(body.error,).toBe("Lore entry not found",);
    expect(await entryIdsOf(db, worldId,),).toEqual([entryId,],);
  });

  test("admin bypasses ownership on another user's world", async () => {
    const worldId = await seedWorld(db, otherId,);

    const listRes = await makeApp(db, ownerId, "admin",).handle(
      new Request(`http://localhost/api/worlds/${worldId}/lore-entries`,),
    );
    expect(listRes.status,).toBe(200,);
    const listed = (await listRes.json()) as ListPayload;
    expect(listed.pagination.total,).toBe(0,);

    const { res, body, } = await postEntry(db, ownerId, "admin", worldId, { content: "Admin entry", },);
    expect(res.status,).toBe(201,);
    const created = body as LoreEntryPayload;
    expect(created.world_id,).toBe(worldId,);
    expect(await entryIdsOf(db, worldId,),).toEqual([created.id,],);
  });

  test("nonexistent world is denied for list and create", async () => {
    const ghostWorld = uid();

    const listRes = await makeApp(db, ownerId, "user",).handle(
      new Request(`http://localhost/api/worlds/${ghostWorld}/lore-entries`,),
    );
    expect(listRes.status,).toBe(404,);
    expect(((await listRes.json()) as ErrorPayload).error,).toBe("Lore entry not found",);

    const { res, body, } = await postEntry(db, ownerId, "user", ghostWorld, { content: "Orphan", },);
    expect(res.status,).toBe(404,);
    expect((body as ErrorPayload).error,).toBe("Lore entry not found",);
  });

  test("entry from another world cannot be updated or deleted through a mismatched world path", async () => {
    const entryWorld = await seedWorld(db, ownerId,);
    const otherWorld = await seedWorld(db, otherId,);
    const entryId = await seedEntry(db, entryWorld, "The gate opens at dusk.",);

    // `ownerId` as admin clears ownership of `otherWorld`, so the request
    // reaches the entity lookup with a cross-world entry id.
    const putRes = await makeApp(db, ownerId, "admin",).handle(
      new Request(`http://localhost/api/worlds/${otherWorld}/lore-entries/${entryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ content: "Hijacked", },),
      },),
    );
    expect(putRes.status,).toBe(404,);
    expect(((await putRes.json()) as ErrorPayload).error,).toBe("Lore entry not found",);

    const untouched = await db
      .selectFrom("world_lore_entries",)
      .select(["world_id", "content",],)
      .where("id", "=", entryId,)
      .executeTakeFirst();
    expect(untouched?.world_id,).toBe(entryWorld,);
    expect(untouched?.content,).toBe("The gate opens at dusk.",);

    // The factory's DELETE is idempotent (Kysely's delete.execute() always
    // yields one result row, so its not-found branch never fires); the
    // cross-world delete is refused by the data layer, not by the status code.
    const delRes = await makeApp(db, ownerId, "admin",).handle(
      new Request(`http://localhost/api/worlds/${otherWorld}/lore-entries/${entryId}`, { method: "DELETE", },),
    );
    expect(delRes.status,).toBe(204,);
    expect(await entryIdsOf(db, entryWorld,),).toEqual([entryId,],);
  });

  test("owner updates a lore entry in its own world", async () => {
    const worldId = await seedWorld(db, ownerId,);
    const entryId = await seedEntry(db, worldId, "The gate opens at dusk.",);

    const res = await makeApp(db, ownerId, "user",).handle(
      new Request(`http://localhost/api/worlds/${worldId}/lore-entries/${entryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ content: "The gate opens at dawn.", },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as LoreEntryPayload;
    expect(body.content,).toBe("The gate opens at dawn.",);

    const row = await db
      .selectFrom("world_lore_entries",)
      .select(["content",],)
      .where("id", "=", entryId,)
      .executeTakeFirst();
    expect(row?.content,).toBe("The gate opens at dawn.",);
  });

  test("owner deletes a lore entry in its own world", async () => {
    const worldId = await seedWorld(db, ownerId,);
    const entryId = await seedEntry(db, worldId, "The gate opens at dusk.",);

    const res = await makeApp(db, ownerId, "user",).handle(
      new Request(`http://localhost/api/worlds/${worldId}/lore-entries/${entryId}`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(204,);

    const row = await db
      .selectFrom("world_lore_entries",)
      .select(["id",],)
      .where("id", "=", entryId,)
      .executeTakeFirst();
    expect(row,).toBeUndefined();
  });
});
