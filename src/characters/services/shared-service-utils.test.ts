/**
 * Shared Character Service Utils Tests
 *
 * Unit tests for the transaction helper shared by the character services.
 */
import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { withExplicitWorldScope, withTransaction, } from "./shared-service-utils";

describe("withTransaction", () => {
  let fixture: TestDb;
  let db: Kysely<DB>;

  beforeAll(async () => {
    fixture = await createTestDb();
    db = fixture.db;
  },);

  afterAll(async () => {
    await destroyTestDb(fixture,);
  },);

  it("opens a transaction and passes its handle to the callback", async () => {
    const value = await withTransaction(db, async (trx,) => {
      expect(trx.isTransaction,).toBe(true,);
      return "done";
    },);

    expect(value,).toBe("done",);
  });

  it("reuses an ambient transaction instead of opening a second one", async () => {
    await db.transaction().execute(async (trx,) => {
      const handle = await withTransaction(trx, async (inner,) => inner,);

      // A second `db.transaction()` on a Transaction throws in Kysely, so
      // identity here is the proof that no nested transaction was opened.
      expect(handle,).toBe(trx,);
    },);
  });

  it("propagates an error thrown by the callback", async () => {
    await expect(
      withTransaction(db, async () => {
        throw new Error("boom",);
      },),
    ).rejects.toThrow("boom",);
  });

  it("commits writes when the callback succeeds", async () => {
    await withTransaction(db, async (trx,) => {
      await trx.insertInto("actors",).values({ id: crypto.randomUUID(), display_name: "withTransaction-commit", },)
        .execute();
    },);

    const rows = await db
      .selectFrom("actors",)
      .where("display_name", "=", "withTransaction-commit",)
      .selectAll()
      .execute();

    expect(rows,).toHaveLength(1,);
  });

  it("rolls back writes when the callback throws", async () => {
    await expect(
      withTransaction(db, async (trx,) => {
        await trx.insertInto("actors",).values({ id: crypto.randomUUID(), display_name: "withTransaction-rollback", },)
          .execute();

        throw new Error("boom",);
      },),
    ).rejects.toThrow("boom",);

    const rows = await db
      .selectFrom("actors",)
      .where("display_name", "=", "withTransaction-rollback",)
      .selectAll()
      .execute();

    expect(rows,).toHaveLength(0,);
  });
});

// RESOURCE CONTRACT (parallel-safe): this block owns its OWN in-memory fixture
// (created in `beforeAll`, destroyed in `afterAll`), independent of the
// `withTransaction` fixture above — neither block reads rows the other wrote,
// so the file passes in any order and in parallel with sibling files. No port,
// no file, no `setTestDatabase` override.
describe("withExplicitWorldScope", () => {
  let fixture: TestDb;
  let db: Kysely<DB>;

  beforeAll(async () => {
    fixture = await createTestDb();
    db = fixture.db;

    // One actor with a balance in three scopes: two worlds and global (NULL).
    for (const worldId of [null, "world-a", "world-b",]) {
      await db
        .insertInto("actor_story_points",)
        .values({ actor_id: "actor-scoped", world_id: worldId, },)
        .execute();
    }
  },);

  afterAll(async () => {
    await destroyTestDb(fixture,);
  },);

  const worldIds = async (worldId: string | undefined,): Promise<Array<string | null>> => {
    const rows = await withExplicitWorldScope(
      db.selectFrom("actor_story_points",).select(["world_id",],),
      worldId,
    ).execute();

    return rows.map((row,) => row.world_id);
  };

  it("narrows to the requested world", async () => {
    expect(await worldIds("world-a",),).toEqual(["world-a",],);
    expect(await worldIds("world-b",),).toEqual(["world-b",],);
  });

  it("an omitted world means the GLOBAL (NULL) scope, never every world", async () => {
    // This is the write-safety contract: a mutation with no world must not be
    // able to hit an arbitrary world's row.
    expect(await worldIds(undefined,),).toEqual([null,],);
  });

  it("returns the same builder type it was given, so callers can keep chaining", async () => {
    const row = await withExplicitWorldScope(
      db.selectFrom("actor_story_points",).select(["world_id", "balance",],),
      "world-a",
    ).executeTakeFirst();

    expect(row?.world_id,).toBe("world-a",);
    expect(row?.balance,).toBe(0,);
  });
});
