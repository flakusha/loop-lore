// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Database, } from "bun:sqlite";
import { afterAll, afterEach, beforeAll, describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";
import { asTableName, } from "../hash/record-hash";
import {
  __peekContentVersionRegistry,
  __resetContentVersionRegistry,
  computeRowHash,
  getContentEnvelope,
  registerContentVersion,
  runBatchRefresh,
} from "./content-version";
import { createSqliteDialect, } from "./index";

afterEach(() => {
  __resetContentVersionRegistry();
},);

describe("registerContentVersion", () => {
  test("stores the projection keyed on (table, v)", () => {
    registerContentVersion("messages", 1, ["chat_id", "author_id", "body",],);
    const r = __peekContentVersionRegistry();
    expect(r.get("messages",)?.get(1,),).toEqual(["author_id", "body", "chat_id",],);
  });

  test("is idempotent on duplicate registration", () => {
    registerContentVersion("messages", 1, ["chat_id", "body",],);
    registerContentVersion("messages", 1, ["body", "chat_id",],);
    const r = __peekContentVersionRegistry();
    expect(r.get("messages",)?.size,).toBe(1,);
  });

  test("normalizes column casing + ordering", () => {
    registerContentVersion("messages", 2, ["CHAT_ID", "Body",],);
    const cols = __peekContentVersionRegistry().get("messages",)?.get(2,);
    expect(cols,).toEqual(["body", "chat_id",],);
  });

  test("throws on duplicate v with different columns", () => {
    registerContentVersion("messages", 1, ["a", "b",],);
    expect(() => registerContentVersion("messages", 1, ["a", "c",],)).toThrow(/different columns/,);
  });

  test("throws on empty projection", () => {
    expect(() => registerContentVersion("messages", 1, [],)).toThrow(/empty/,);
  });

  test("data_version 0 is a valid base (pre-ship); negative/fractional invalid", () => {
    registerContentVersion("messages", 0, ["a",],);
    expect(__peekContentVersionRegistry().get("messages",)?.get(0,),).toEqual(["a",],);
    expect(() => registerContentVersion("messages", -1, ["a",],)).toThrow(/invalid/,);
    expect(() => registerContentVersion("messages", 1.5, ["a",],)).toThrow(/invalid/,);
  });
});

describe("getContentEnvelope", () => {
  test("emits the v projection", () => {
    registerContentVersion("messages", 1, ["chat_id", "body",],);
    const env = getContentEnvelope(asTableName("messages",), {
      id: "m1",
      data_version: 1,
      chat_id: "c1",
      body: "hi",
      metadata: "extra", // ignored (not in projection)
    },);
    expect(env,).toEqual({ chat_id: "c1", body: "hi", },);
  });

  test("returns null for unknown table", () => {
    expect(getContentEnvelope(asTableName("messages",), { id: "x", data_version: 1, },),).toBeNull();
  });

  test("returns null for unknown data_version", () => {
    registerContentVersion("messages", 1, ["chat_id",],);
    expect(getContentEnvelope(asTableName("messages",), { id: "x", data_version: 99, chat_id: "c", },),).toBeNull();
  });

  test("skips undefined values", () => {
    registerContentVersion("messages", 1, ["chat_id", "body",],);
    const env = getContentEnvelope(asTableName("messages",), {
      id: "x",
      data_version: 1,
      chat_id: "c",
      // body is undefined
      body: undefined,
    },);
    expect(env,).toEqual({ chat_id: "c", },);
  });
});

describe("computeRowHash", () => {
  test("produces same hash for same input", () => {
    registerContentVersion("messages", 1, ["chat_id", "body",],);
    const row = { id: "m1", data_version: 1, chat_id: "c1", body: "hi", };
    expect(computeRowHash(asTableName("messages",), row,),).toBe(
      computeRowHash(asTableName("messages",), row,),
    );
  });

  test("different row content → different hash", () => {
    registerContentVersion("messages", 1, ["chat_id", "body",],);
    const a = computeRowHash(asTableName("messages",), { id: "m1", data_version: 1, chat_id: "c1", body: "hi", },);
    const b = computeRowHash(asTableName("messages",), { id: "m1", data_version: 1, chat_id: "c1", body: "ho", },);
    expect(a,).not.toBe(b,);
  });

  test("returns null when projection missing", () => {
    const h = computeRowHash(asTableName("messages",), { id: "x", data_version: 1, },);
    expect(h,).toBeNull();
  });

  test("bumping data_version changes the hash projection path", () => {
    registerContentVersion("messages", 1, ["chat_id",],);
    registerContentVersion("messages", 2, ["chat_id", "body",],);
    const v1 = computeRowHash(asTableName("messages",), { id: "m1", data_version: 1, chat_id: "c1", },);
    const v2 = computeRowHash(asTableName("messages",), { id: "m1", data_version: 2, chat_id: "c1", body: "x", },);
    expect(v1,).not.toBe(v2,);
  });
});

describe("runBatchRefresh", () => {
  let sqlite: Database;
  let db: Kysely<any>;

  const TABLE = "cv_refresh_rows";

  beforeAll(() => {
    sqlite = new Database(":memory:",);
    db = new Kysely({ dialect: createSqliteDialect(sqlite,), },);
    sqlite.run(
      `CREATE TABLE ${TABLE} (id TEXT PRIMARY KEY, data_version INTEGER NOT NULL, body TEXT NOT NULL, record_hash TEXT NOT NULL DEFAULT '')`,
    );
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  afterEach(() => {
    __resetContentVersionRegistry();
    sqlite.run(`DELETE FROM ${TABLE}`,);
  },);
  function insertRow(id: string, dataVersion: number, body: string, recordHash: string,): void {
    sqlite.run(
      `INSERT INTO ${TABLE} (id, data_version, body, record_hash) VALUES (?, ?, ?, ?)`,
      [id, dataVersion, body, recordHash,],
    );
  }

  test("returns zeros when the table has no registered projection", async () => {
    expect(await runBatchRefresh(db, TABLE,),).toEqual({ scanned: 0, updated: 0, skipped: 0, },);
  });

  test("rehashes stale rows once, then is a no-op; skips unknown versions", async () => {
    registerContentVersion(TABLE, 0, ["body",],);
    insertRow("r1", 0, "alpha", "stale",);
    insertRow("r2", 0, "beta", "stale",);
    // data_version 1 has no registered projection → must be skipped, not hashed.
    insertRow("r3", 1, "gamma", "",);

    const first = await runBatchRefresh(db, TABLE,);
    expect(first,).toEqual({ scanned: 3, updated: 2, skipped: 1, },);

    // Second pass: hashes now match → nothing updated.
    const second = await runBatchRefresh(db, TABLE,);
    expect(second,).toEqual({ scanned: 3, updated: 0, skipped: 1, },);

    // r3 (unknown projection) must never be written.
    const r3 = sqlite.query(`SELECT record_hash FROM ${TABLE} WHERE id = 'r3'`,).get() as { record_hash: string };
    expect(r3.record_hash,).toBe("",);
  });

  test("dataVersion filter only refreshes rows at that version", async () => {
    registerContentVersion(TABLE, 0, ["body",],);
    insertRow("f1", 0, "delta", "stale",);
    insertRow("f2", 3, "omega", "stale",);

    const result = await runBatchRefresh(db, TABLE, { dataVersion: 0, },);
    expect(result,).toEqual({ scanned: 1, updated: 1, skipped: 0, },);
    const f2 = sqlite.query(`SELECT record_hash FROM ${TABLE} WHERE id = 'f2'`,).get() as { record_hash: string };
    expect(f2.record_hash,).toBe("stale",);
  });
});
