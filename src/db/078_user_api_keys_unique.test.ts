// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Final-schema oracle for the `(user_id, provider_name)` unique index on
 * `user_api_keys` (owned by 001_core in the consolidated chain).
 *
 * Before the constraint existed the route's read-then-write upsert was the
 * only dedupe, so two concurrent POSTs for the same provider both inserted.
 * The migration-time collapse of pre-existing duplicates is gone in the
 * consolidated chain; this file pins the constraint and its scope.
 */
import { describe, expect, test, } from "bun:test";
import { type Kysely, sql, } from "kysely";

import { createTestDb, } from "../test-utils/create-test-db";
import { insertUserApiKeys, insertUsers, } from "../test-utils/insert-helpers";
import type { DB, } from "./schema";

const UNIQUE_INDEX = "uq_user_api_keys_user_provider";
const PLAIN_INDEX = "idx_user_api_keys_user_provider";

/**
 * @param db
 * @param name index to look for
 * @returns whether that index is present in the schema
 */
async function hasIndex(db: Kysely<DB>, name: string,): Promise<boolean> {
  const rows = await sql<{ name: string }>`
    SELECT name FROM sqlite_master WHERE type = 'index' AND name = ${name}
  `.execute(db,);

  return rows.rows.length > 0;
}

async function insertKey(
  db: Kysely<DB>,
  userId: string,
  provider: string,
  id: string,
  updatedAt: string,
): Promise<void> {
  await insertUserApiKeys(db, userId, provider, "sk-enc", { id, updated_at: updatedAt, },);
}

async function keyIds(db: Kysely<DB>, userId: string, provider: string,): Promise<string[]> {
  const rows = await sql<{ id: string }>`
    SELECT id FROM user_api_keys WHERE user_id = ${userId} AND provider_name = ${provider}
    ORDER BY updated_at ASC, rowid ASC
  `.execute(db,);

  return rows.rows.map((r,) => r.id);
}

describe("user_api_keys unique (final schema)", () => {
  test("the unique index is present and rejects a racing duplicate provider", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const userId = await insertUsers(db, `uak-${crypto.randomUUID()}`, "UAK",);
      expect(await hasIndex(db, UNIQUE_INDEX,),).toBe(true,);
      expect(await hasIndex(db, PLAIN_INDEX,),).toBe(false,);

      await insertKey(db, userId, "prov-a", "first", "2026-01-01T00:00:00Z",);
      expect(await keyIds(db, userId, "prov-a",),).toEqual(["first",],);

      // The racing second POST now aborts at the database.
      await expect(
        insertKey(db, userId, "prov-a", "dup-racing", "2026-01-02T00:00:00Z",),
      ).rejects.toThrow(/UNIQUE/i,);
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });

  test("leaves other providers and other users unconstrained", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const userA = await insertUsers(db, `uak-a-${crypto.randomUUID()}`, "A",);
      const userB = await insertUsers(db, `uak-b-${crypto.randomUUID()}`, "B",);
      // Same provider across DIFFERENT users is not a duplicate group.
      await insertKey(db, userA, "prov-x", "a-row", "2026-01-01T00:00:00Z",);
      await insertKey(db, userB, "prov-x", "b-row", "2026-01-01T00:00:00Z",);
      // Different provider for the same user is not one either.
      await insertKey(db, userA, "prov-y", "a-other", "2026-01-01T00:00:00Z",);

      expect(await keyIds(db, userA, "prov-x",),).toEqual(["a-row",],);
      expect(await keyIds(db, userB, "prov-x",),).toEqual(["b-row",],);
      expect(await keyIds(db, userA, "prov-y",),).toEqual(["a-other",],);
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });
});
