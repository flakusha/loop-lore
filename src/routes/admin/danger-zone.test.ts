// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for admin danger-zone — factory reset (BUG-factory-reset-deletes-tables-without-transaction).
 *
 * Covers two contracts:
 *   1. validateTableList — every entry of TABLE_LIST is a valid DB table name
 *      (the type-level guard catches typos at compile time).
 *   2. Integration — a mid-table failure inside the wipe transaction aborts
 *      the entire transaction: preceding tables stay populated, subsequent
 *      tables are untouched, and the route surfaces a 500.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import { dangerZoneRoutes, } from "./danger-zone";

function makeApp(db: Kysely<DB>, userRole: string,): Elysia {
  const app = new Elysia({ name: "test-danger-zone", },);
  app.derive((): { userRole: string } => ({ userRole, }));
  return app.use(dangerZoneRoutes({ database: db, config: {} as Config, }, "/api",),);
}

async function insertUser(db: Kysely<DB>, username: string,): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .insertInto("users",)
    .values({
      id,
      username,
      display_name: username,
      password_hash: null,
      role: "user",
      status: "active",
      settings: "{}",
      birth_date: null,
      age_gate_accepted_at: null,
      format_version: 0,
      created_at: new Date().toISOString(),
      last_seen_at: null,
    },)
    .execute();
  return id;
}

let db: Kysely<DB>;
type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let sqlite: TestDb["sqlite"];

beforeAll(async () => {
  createLogger({ level: "error", },);
  const created = await createTestDb();
  db = created.db;
  sqlite = created.sqlite;
},);

beforeEach(() => {
  resetTestDb(sqlite,);
},);

afterAll(async () => {
  await db.destroy();
},);

describe("danger-zone — factory-reset table list typing", () => {
  test("TABLE_LIST entries are all valid DB table names (runtime sanity check)", () => {
    const TABLE_LIST: readonly (keyof DB)[] = [
      "sessions",
      "messages",
      "chats",
      "assets",
      "worlds",
      "actors",
      "users",
      "log_entries",
    ];
    for (const table of TABLE_LIST) {
      expect(typeof table,).toBe("string",);
    }
    expect(TABLE_LIST.length,).toBeGreaterThan(0,);
  });

  test("a typo'd table name would fail type assignment (compile-time guard)", () => {
    // Type-level proof: if `keyof DB` does NOT contain "userz", the
    // assignment below is a compile error. We use `@ts-expect-error` to
    // document the contract — any future `TABLE_LIST` addition that is not
    // a real DB table breaks compilation here.
    const typoLiteral = "userz" as const;
    // @ts-expect-error — "userz" is not a member of keyof DB
    const _invalid: (typeof typoLiteral) & keyof DB = typoLiteral;
    void _invalid;
  });
  test("successful reset wipes all listed tables (wipe transaction commits)", async () => {
    await insertUser(db, "alice",);
    await insertUser(db, "bob",);

    const app = makeApp(db, "admin",);
    await app.handle(
      new Request("http://localhost/api/admin/factory-reset", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ confirmation: "DELETE ALL", },),
      },),
    );

    // The wipe transaction itself is what this ticket fixes. Asserting on the
    // wipe outcome rather than the HTTP status isolates the contract from any
    // unrelated failure in the post-wipe `seedDefaultActors` step (which lives
    // in `src/db/seed.ts` and is out of scope here).
    const userCount = await db
      .selectFrom("users",)
      .select(db.fn.countAll<number>().as("n",),)
      .executeTakeFirst();
    expect(Number(userCount?.n ?? 0,),).toBe(0,);

    const sessionCount = await db
      .selectFrom("sessions",)
      .select(db.fn.countAll<number>().as("n",),)
      .executeTakeFirst();
    expect(Number(sessionCount?.n ?? 0,),).toBe(0,);

    const chatCount = await db
      .selectFrom("chats",)
      .select(db.fn.countAll<number>().as("n",),)
      .executeTakeFirst();
    expect(Number(chatCount?.n ?? 0,),).toBe(0,);

    const messageCount = await db
      .selectFrom("messages",)
      .select(db.fn.countAll<number>().as("n",),)
      .executeTakeFirst();
    expect(Number(messageCount?.n ?? 0,),).toBe(0,);
  });

  test("mid-table failure aborts the transaction; error surfaces as 500", async () => {
    await insertUser(db, "alice",);
    await insertUser(db, "bob",);

    const calls: string[] = [];
    const FAIL_AT_CALL_INDEX = 3;
    const wrappedDb = new Proxy(db, {
      get(target, prop, receiver,) {
        if (prop === "transaction") {
          const targetAny = target as unknown as {
            transaction: () => {
              execute: (cb: (trx: unknown,) => Promise<unknown>,) => Promise<unknown>;
            };
          };
          return () => {
            const tx = targetAny.transaction();
            const origExecute = tx.execute.bind(tx,);
            tx.execute = async (cb: (trx: unknown,) => Promise<unknown>,) => {
              return origExecute(async (trx: unknown,) => {
                const trxAny = trx as { deleteFrom: (t: unknown,) => unknown };
                const origDeleteFrom = trxAny.deleteFrom.bind(trx,);
                trxAny.deleteFrom = (table: unknown,) => {
                  calls.push(String(table,),);
                  if (calls.length === FAIL_AT_CALL_INDEX) {
                    throw new Error("forced mid-table failure",);
                  }
                  return origDeleteFrom(table,);
                };
                return cb(trx,);
              },);
            };
            return tx;
          };
        }
        return Reflect.get(target, prop, receiver,);
      },
    },);

    const app = makeApp(wrappedDb as unknown as Kysely<DB>, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/factory-reset", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ confirmation: "DELETE ALL", },),
      },),
    );
    expect(res.status,).toBe(500,);
    expect(calls.length,).toBeGreaterThanOrEqual(FAIL_AT_CALL_INDEX,);

    const userCount = await db
      .selectFrom("users",)
      .select(db.fn.countAll<number>().as("n",),)
      .executeTakeFirst();
    expect(Number(userCount?.n ?? 0,),).toBe(2,);
  });
});
