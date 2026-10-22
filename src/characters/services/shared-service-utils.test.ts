/**
 * Shared Character Service Utils Tests
 *
 * Unit tests for the transaction helper shared by the character services.
 */
import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { withTransaction, } from "./shared-service-utils";

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
      await trx.insertInto("actors",).values({ display_name: "withTransaction-commit", },).execute();
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
        await trx.insertInto("actors",).values({ display_name: "withTransaction-rollback", },).execute();
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
