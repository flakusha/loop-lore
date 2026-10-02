// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Database, } from "bun:sqlite";
import type { Kysely, } from "kysely";
import { isUsableEncryptionSecret, } from "../crypto/user-secret";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertUsers, } from "../test-utils/insert-helpers";
import { runBackfill, } from "./backfill-users-encryption-secret";

let db: Kysely<DB>;
let sqlite: Database;
let keyedId: string;
let nullSecretId: string;
let emptySecretId: string;

const PRE_EXISTING = "c".repeat(64,);

beforeAll(async () => {
  ({ db, sqlite, } = await createTestDb());
  keyedId = await insertUsers(db, "bf-keyed", "Keyed", { encryption_secret: PRE_EXISTING, },);
  nullSecretId = await insertUsers(db, "bf-null", "Null", { encryption_secret: null, },);
  emptySecretId = await insertUsers(db, "bf-empty", "Empty", { encryption_secret: "", },);
},);

afterAll(async () => { await sqlite.close(); },);

/** Read the stored secret straight from the DB — no mock, no echo. */
async function secretOf(userId: string,): Promise<string | null> {
  const row = await db.selectFrom("users",).select("encryption_secret",).where("id", "=", userId,).executeTakeFirst();
  return row?.encryption_secret ?? null;
}

describe("runBackfill", () => {
  test("fills only the keyless users and leaves the keyed one untouched", async () => {
    const summary = await runBackfill(db, {},);
    expect(summary.missing,).toBe(2,);
    expect(summary.updated,).toBe(2,);
    expect(isUsableEncryptionSecret(await secretOf(nullSecretId,),),).toBe(true,);
    expect(isUsableEncryptionSecret(await secretOf(emptySecretId,),),).toBe(true,);
    expect(await secretOf(keyedId,),).toBe(PRE_EXISTING,);
  });
  test("second run is a no-op — it must not rotate a live key", async () => {
    const afterFirst = await secretOf(nullSecretId,);
    const summary = await runBackfill(db, {},);
    expect(summary.missing,).toBe(0,);
    expect(summary.updated,).toBe(0,);
    expect(await secretOf(nullSecretId,),).toBe(afterFirst,);
  });
  test("backfilled users get distinct secrets from each other", async () => {
    const [a, b,] = [await secretOf(nullSecretId,), await secretOf(emptySecretId,),];
    expect(a,).not.toBe(b,);
  });
  test("dry-run reports the work without writing", async () => {
    const freshId = await insertUsers(db, "bf-dry", "Dry", { encryption_secret: null, },);
    const summary = await runBackfill(db, { dryRun: true, },);
    expect(summary.missing,).toBe(1,);
    expect(summary.updated,).toBe(1,);
    expect(summary.dryRun,).toBe(true,);
    expect(await secretOf(freshId,),).toBeNull();
  });
});
