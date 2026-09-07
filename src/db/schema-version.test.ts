// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";
import { createSqliteDialect, } from "./index";
import { down as down018, up as up018, } from "./migrations/parts/018_schema_version";
import { getSchemaVersion, recordSchemaVersion, } from "./schema-version";

describe("schema-version", () => {
  let db: Database;
  let kysely: Kysely<unknown>;

  beforeAll(() => {
    db = new Database(":memory:",);
    kysely = new Kysely({ dialect: createSqliteDialect(db,), },);
  },);

  afterAll(async () => {
    await kysely.destroy();
    db.close();
  },);

  test("returns 0 when the table does not exist", async () => {
    expect(await getSchemaVersion(kysely,),).toBe(0,);
  });

  test("backfills parts 001-018 on up()", async () => {
    await up018(kysely,);
    expect(await getSchemaVersion(kysely,),).toBe(18,);
  });

  test("recordSchemaVersion is idempotent", async () => {
    await recordSchemaVersion(kysely, 19, "future part",);
    await recordSchemaVersion(kysely, 19, "future part",);
    expect(await getSchemaVersion(kysely,),).toBe(19,);
  });

  test("down() drops the table", async () => {
    await down018(kysely,);
    expect(await getSchemaVersion(kysely,),).toBe(0,);
  });
});
