// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Migration 078 — UNIQUE index on `user_api_keys (user_id, provider_name)`.
 *
 * Before 078 the route's read-then-write upsert was the only dedupe, so two
 * concurrent POSTs for the same provider both passed the lookup and both
 * inserted (BUG-user-api-keys-non-unique-index-read-then-write-upsert-allows);
 * `executeTakeFirst` then read an arbitrary duplicate. 078 makes the DATABASE
 * the arbiter — and first collapses the duplicate groups a raced database
 * already accumulated, because `CREATE UNIQUE INDEX` aborts on those and would
 * leave the migration chain stuck half-applied.
 *
 * Mirrors src/db/045_messages_idempotency_unique.test.ts and, like it, lives
 * in `src/db/` NOT `src/db/migrations/` (getMigrationFiles would register the
 * colocated test as a migration).
 */
import { describe, expect, test, } from "bun:test";
import { type Kysely, sql, } from "kysely";

import { captureWarnings, } from "../test-utils/capture-warnings";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertUserApiKeys, insertUsers, } from "../test-utils/insert-helpers";
import { down, up, } from "./migrations/078_user_api_keys_unique";
import type { DB, } from "./schema";

const MIGRATION = "078_user_api_keys_unique";
const UNIQUE_INDEX = "uq_user_api_keys_user_provider";
const PLAIN_INDEX = "idx_user_api_keys_user_provider";

/** `up`/`down` are typed against the untyped handle the migrator passes them. */
type UntypedDb = Kysely<unknown>;

/**
 * Back to the pre-078 shape: the plain index back, the unique index gone.
 * @param db
 */
async function restorePre078(db: Kysely<DB>,): Promise<void> {
  await sql`DROP INDEX IF EXISTS uq_user_api_keys_user_provider`.execute(db,);
  await sql`CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_provider ON user_api_keys (user_id, provider_name)`
    .execute(db,);
}

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

/**
 * @param db
 * @param userId owner of the row
 * @param provider provider_name half of the unique key
 * @param id row id
 * @param updatedAt updated_at — the NEWEST row of a group survives
 */
async function insertKey(
  db: Kysely<DB>,
  userId: string,
  provider: string,
  id: string,
  updatedAt: string,
): Promise<void> {
  await insertUserApiKeys(db, userId, provider, "sk-enc", { id, updated_at: updatedAt, },);
}

/**
 * @param db
 * @param userId owner
 * @param provider provider to group by
 * @returns ids sharing that (user, provider), oldest updated_at first
 */
async function keyIds(db: Kysely<DB>, userId: string, provider: string,): Promise<string[]> {
  const rows = await sql<{ id: string }>`
    SELECT id FROM user_api_keys WHERE user_id = ${userId} AND provider_name = ${provider}
    ORDER BY updated_at ASC, rowid ASC
  `.execute(db,);

  return rows.rows.map((r,) => r.id);
}

describe(MIGRATION, () => {
  test("collapses a duplicate group to its newest row, warns, then enforces the index", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const userId = await insertUsers(db, `uak-${crypto.randomUUID()}`, "UAK",);
      await restorePre078(db,);
      // Same user, same provider, distinct updated_at: the survivor is
      // deterministic — the newest row by (updated_at, rowid).
      await insertKey(db, userId, "prov-a", "dup-older", "2026-01-01T00:00:00Z",);
      await insertKey(db, userId, "prov-a", "dup-newest", "2026-01-02T00:00:00Z",);

      const warnings = await captureWarnings(async () => {
        await up(db as unknown as UntypedDb,);
      }, new RegExp(`^\\[${MIGRATION}\\]`,),);

      // The newest row survives: the last save is the one the user meant.
      expect(await keyIds(db, userId, "prov-a",),).toEqual(["dup-newest",],);
      expect(warnings,).toHaveLength(1,);
      expect(warnings[0],).toContain(MIGRATION,);
      expect(warnings[0],).toContain("collapsing to newest",);

      // The unique index is present and the redundant plain index is gone.
      expect(await hasIndex(db, UNIQUE_INDEX,),).toBe(true,);
      expect(await hasIndex(db, PLAIN_INDEX,),).toBe(false,);

      // Enforced: the racing second POST now aborts at the database.
      await expect(
        insertKey(db, userId, "prov-a", "dup-racing", "2026-01-03T00:00:00Z",),
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
      await restorePre078(db,);
      // Same provider across DIFFERENT users is not a duplicate group.
      await insertKey(db, userA, "prov-x", "a-row", "2026-01-01T00:00:00Z",);
      await insertKey(db, userB, "prov-x", "b-row", "2026-01-01T00:00:00Z",);
      // Different provider for the same user is not one either.
      await insertKey(db, userA, "prov-y", "a-other", "2026-01-01T00:00:00Z",);

      const warnings = await captureWarnings(async () => {
        await up(db as unknown as UntypedDb,);
      }, new RegExp(`^\\[${MIGRATION}\\]`,),);

      expect(warnings,).toEqual([],);
      expect(await keyIds(db, userA, "prov-x",),).toEqual(["a-row",],);
      expect(await keyIds(db, userB, "prov-x",),).toEqual(["b-row",],);
      expect(await keyIds(db, userA, "prov-y",),).toEqual(["a-other",],);
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });

  test("down() restores the pre-078 duplicate-tolerant shape", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const userId = await insertUsers(db, `uak-${crypto.randomUUID()}`, "UAK",);
      // `createTestDb()` ran 078 as part of the chain.
      expect(await hasIndex(db, UNIQUE_INDEX,),).toBe(true,);

      await down(db as unknown as UntypedDb,);

      expect(await hasIndex(db, UNIQUE_INDEX,),).toBe(false,);
      expect(await hasIndex(db, PLAIN_INDEX,),).toBe(true,);
      // Pre-078 behaviour is back: two rows for one (user, provider) coexist.
      await insertKey(db, userId, "prov-d", "after-down-a", "2026-02-01T00:00:00Z",);
      await insertKey(db, userId, "prov-d", "after-down-b", "2026-02-02T00:00:00Z",);
      expect(await keyIds(db, userId, "prov-d",),).toEqual(["after-down-a", "after-down-b",],);
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });
},);
