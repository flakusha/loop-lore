// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared Service Utils Tests
 *
 * Unit tests for the transaction helper shared by the character services.
 *
 * Covers `withTransaction`'s two branches: it opens a transaction for a plain
 * Kysely handle, and re-uses the ambient one when the caller already holds a
 * Transaction (calling `transaction()` on a Transaction throws in Kysely).
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { withTransaction, } from "./shared-service-utils";

let fixture: TestDb;
let db: Kysely<DB>;

beforeEach(async () => {
  fixture = await createTestDb();
  db = fixture.db;
},);

afterEach(async () => {
  await destroyTestDb(fixture,);
},);

describe("withTransaction", () => {
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

  it("opens a transaction for a plain handle and commits the write", async () => {
    expect(db.isTransaction,).toBe(false,);

    const result = await withTransaction(db, async (trx,) => {
      expect(trx.isTransaction,).toBe(true,);
      await trx
        .insertInto("system_config",)
        .values({ key: "tx-committed", value: "yes", },)
        .execute();

      return "callback-value";
    },);

    expect(result,).toBe("callback-value",);
    const row = await db
      .selectFrom("system_config",)
      .select("value",)
      .where("key", "=", "tx-committed",)
      .executeTakeFirst();

    expect(row?.value,).toBe("yes",);
  });

  it("re-uses the ambient transaction instead of opening a second one", async () => {
    const result = await db.transaction().execute(async (trx,) => {
      expect(trx.isTransaction,).toBe(true,);
      return await withTransaction(trx, async (inner,) => {
        // Same handle — no second transaction was opened.
        expect(inner,).toBe(trx,);
        expect(inner.isTransaction,).toBe(true,);
        return "inner-value";
      },);
    },);

    expect(result,).toBe("inner-value",);
  });

  it("rolls back when the callback throws — the write does not persist", async () => {
    await expect(
      withTransaction(db, async (trx,) => {
        await trx
          .insertInto("system_config",)
          .values({ key: "tx-rolled-back", value: "no", },)
          .execute();

        throw new Error("callback failed",);
      },),
    ).rejects.toThrow("callback failed",);

    const row = await db
      .selectFrom("system_config",)
      .select("value",)
      .where("key", "=", "tx-rolled-back",)
      .executeTakeFirst();

    expect(row,).toBeUndefined();
  });
});
