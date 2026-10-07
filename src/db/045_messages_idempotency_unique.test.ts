// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Migration 045 — UNIQUE index on `messages (chat_id, idempotency_key)`.
 *
 * Before 045 the route's `findByIdempotencyKey` pre-read was the only dedupe,
 * so two concurrent POSTs carrying the same idempotencyKey both passed the
 * lookup and both inserted
 * (BUG-message-idempotency-key-dedup-not-db-enforced-concurrent-dup). 045 makes
 * the DATABASE the arbiter — and first collapses the duplicate groups a raced
 * database already accumulated, because `CREATE UNIQUE INDEX` aborts on those
 * and would leave the migration chain stuck half-applied.
 *
 * The collapse loop is the only path a clean database never reaches
 * (`dups.rows` is empty), so it is what this file forces. `createTestDb()`
 * already ran 045 through `runMigrations`, so the unique index is dropped
 * first to recreate the pre-045 shape the loop exists for.
 *
 * Lives in `src/db/` beside 020/024/030/032/033, NOT in `src/db/migrations/`:
 * `getMigrationFiles()` (src/db/migrate.ts) scans that directory with
 * `/^(\d{3})_(.+)\.ts$/`, which matches a colocated `NNN_*.test.ts` and would
 * register it as a migration whose `up` is undefined — crashing every
 * `runMigrations()` call in the suite.
 */
import { describe, expect, test, } from "bun:test";
import { type Kysely, sql, } from "kysely";

import { captureWarnings, } from "../test-utils/capture-warnings";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertChats, insertMessages, insertUsers, } from "../test-utils/insert-helpers";
import { down, up, } from "./migrations/045_messages_idempotency_unique";
import type { DB, } from "./schema";

const MIGRATION = "045_messages_idempotency_unique";
const INDEX = "uq_messages_idempotency_enforced";

/** `up`/`down` are typed against the untyped handle the migrator passes them. */
type UntypedDb = Kysely<unknown>;

/**
 * Back to the pre-045 shape: the unique index gone, duplicate idempotency keys
 * within one chat allowed again.
 * @param db
 */
async function dropUniqueIndex(db: Kysely<DB>,): Promise<void> {
  await sql`DROP INDEX IF EXISTS uq_messages_idempotency_enforced`.execute(db,);
}

/**
 * @param db
 * @returns whether 045's unique index is present in the schema
 */
async function hasUniqueIndex(db: Kysely<DB>,): Promise<boolean> {
  const rows = await sql<{ name: string }>`
    SELECT name FROM sqlite_master WHERE type = 'index' AND name = ${INDEX}
  `.execute(db,);

  return rows.rows.length > 0;
}

/**
 * One user, one actor, one chat — the FK chain a `messages` row needs.
 * @param db
 */
async function seed(db: Kysely<DB>,): Promise<{ chatId: string; actorId: string }> {
  const userId = await insertUsers(db, `idem-${crypto.randomUUID()}`, "Idem",);
  const actorId = await insertActors(db, "Idem Actor", { user_id: userId, },);
  const chatId = await insertChats(db, "Idem Chat", userId,);
  return { chatId, actorId, };
}

/**
 * @param db
 * @param chatId
 * @param actorId
 * @param id message id
 * @param key idempotency_key — the second half of 045's unique key
 * @param createdAt insertion timestamp; the oldest row of a group survives
 */
async function insertKeyed(
  db: Kysely<DB>,
  chatId: string,
  actorId: string,
  id: string,
  key: string,
  createdAt: string,
): Promise<void> {
  await insertMessages(db, chatId, actorId, "user", `body ${id}`, {
    id,
    idempotency_key: key,
    created_at: createdAt,
  },);
}

/**
 * @param db
 * @param chatId
 * @param key idempotency_key to group by
 * @returns ids sharing that key in that chat, oldest first
 */
async function keyedIds(db: Kysely<DB>, chatId: string, key: string,): Promise<string[]> {
  const rows = await sql<{ id: string }>`
    SELECT id FROM messages WHERE chat_id = ${chatId} AND idempotency_key = ${key}
    ORDER BY created_at ASC, rowid ASC
  `.execute(db,);

  return rows.rows.map((r,) => r.id);
}

describe(MIGRATION, () => {
  test("collapses a duplicate group to its oldest row, warns, then enforces the index", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const { chatId, actorId, } = await seed(db,);
      await dropUniqueIndex(db,);
      // Same chat, same non-excluded key, distinct created_at: the survivor is
      // deterministic — the oldest row by (created_at, rowid).
      await insertKeyed(db, chatId, actorId, "dup-oldest", "key-dup", "2026-01-01 00:00:00",);
      await insertKeyed(db, chatId, actorId, "dup-newest", "key-dup", "2026-01-02 00:00:00",);

      // Scoped to this migration's own tag: `warning` is process-wide, so a
      // foreign emitter in the same `bun test` process would otherwise land in
      // `warnings` and break the exact count asserted below.
      const warnings = await captureWarnings(async () => {
        await up(db as unknown as UntypedDb,);
      }, new RegExp(`^\\[${MIGRATION}\\]`,),);

      // The oldest row keeps the key; the raced loser is deleted, not renamed
      // — a message row is append-only history.
      expect(await keyedIds(db, chatId, "key-dup",),).toEqual(["dup-oldest",],);
      expect(warnings,).toHaveLength(1,);
      expect(warnings[0],).toContain(MIGRATION,);
      expect(warnings[0],).toContain("collapsing to oldest",);

      // The index is back ...
      expect(await hasUniqueIndex(db,),).toBe(true,);
      // ... and enforced: the racing second POST now aborts at the database.
      await expect(
        insertKeyed(db, chatId, actorId, "dup-racing", "key-dup", "2026-01-03 00:00:00",),
      ).rejects.toThrow(/UNIQUE/i,);
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });

  test("leaves the regen:variant and turn_skip families repeating and unconstrained", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const { chatId, actorId, } = await seed(db,);
      await dropUniqueIndex(db,);
      // The two families that legitimately REPEAT within one chat: pending
      // regen variants per (parent, style), and minute-bucket turn-skip keys.
      await insertKeyed(db, chatId, actorId, "regen-a", "regen:variant:p1:style1", "2026-01-01 00:00:00",);
      await insertKeyed(db, chatId, actorId, "regen-b", "regen:variant:p1:style1", "2026-01-02 00:00:00",);
      await insertKeyed(db, chatId, actorId, "skip-a", "turn_skip:bucket-1", "2026-01-01 00:00:00",);
      await insertKeyed(db, chatId, actorId, "skip-b", "turn_skip:bucket-2", "2026-01-02 00:00:00",);

      const warnings = await captureWarnings(async () => {
        await up(db as unknown as UntypedDb,);
      }, new RegExp(`^\\[${MIGRATION}\\]`,),);

      // Outside 045's key definition these are not duplicate groups, so
      // nothing is collapsed and nothing is warned about.
      expect(warnings,).toEqual([],);
      expect(await keyedIds(db, chatId, "regen:variant:p1:style1",),).toEqual(["regen-a", "regen-b",],);
      expect(await keyedIds(db, chatId, "turn_skip:bucket-1",),).toEqual(["skip-a",],);
      expect(await keyedIds(db, chatId, "turn_skip:bucket-2",),).toEqual(["skip-b",],);

      // And the index keeps excluding them: a later same-key row still lands.
      await insertKeyed(db, chatId, actorId, "regen-c", "regen:variant:p1:style1", "2026-01-03 00:00:00",);
      await insertKeyed(db, chatId, actorId, "skip-c", "turn_skip:bucket-1", "2026-01-03 00:00:00",);
      expect(await keyedIds(db, chatId, "regen:variant:p1:style1",),).toEqual(["regen-a", "regen-b", "regen-c",],);
      expect(await keyedIds(db, chatId, "turn_skip:bucket-1",),).toEqual(["skip-a", "skip-c",],);
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });

  test("down() drops the index and restores the duplicate-tolerant shape", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const { chatId, actorId, } = await seed(db,);
      // `createTestDb()` ran 045 as part of the chain, so the index is present.
      expect(await hasUniqueIndex(db,),).toBe(true,);

      await down(db as unknown as UntypedDb,);

      expect(await hasUniqueIndex(db,),).toBe(false,);
      // Pre-045 behaviour is back: two same-key rows in one chat coexist.
      await insertKeyed(db, chatId, actorId, "after-down-a", "key-after-down", "2026-02-01 00:00:00",);
      await insertKeyed(db, chatId, actorId, "after-down-b", "key-after-down", "2026-02-02 00:00:00",);
      expect(await keyedIds(db, chatId, "key-after-down",),).toEqual(["after-down-a", "after-down-b",],);
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });
},);
