// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Migration 087 — `chat_owners` co-owners table + creator backfill
 * (TASK-chat-owners-schema-and-backfill, epic-chat-multi-ownership).
 *
 * Pins the ticket ACs directly: backfill exactness (one row per chat,
 * user = created_by, granted_by null), UNIQUE(chat_id, user_id)
 * enforcement at the database, the reason ≤ 500 CHECK, FK cascades, and
 * `down()` restoring the pre-087 shape (no table, backfilled rows gone).
 *
 * Mirrors src/db/078_user_api_keys_unique.test.ts and, like it, lives in
 * `src/db/` NOT `src/db/migrations/` (getMigrationFiles would register the
 * colocated test as a migration).
 *
 * Parallel-safety contract: every test owns a private `:memory:` SQLite DB
 * from its own `createTestDb()` call (no shared handle, no fixed-path
 * fixture) and disposes it in `finally`; usernames carry a randomUUID()
 * suffix. Tests are order-independent and pass alone.
 */
import { describe, expect, test, } from "bun:test";
import { type Kysely, sql, } from "kysely";

import { createTestDb, } from "../test-utils/create-test-db";
import { insertChats, insertUsers, } from "../test-utils/insert-helpers";
import { down, up, } from "./migrations/087_chat_owners";
import type { DB, } from "./schema";

const MIGRATION = "087_chat_owners";

/** `up`/`down` are typed against the untyped handle the migrator passes them. */
type UntypedDb = Kysely<unknown>;

interface OwnerRow {
  chat_id: string;
  user_id: string;
  granted_by: string | null;
  granted_at: string;
  reason: string | null;
}

/**
 * @param db
 * @returns every chat_owners row, deterministic order
 */
async function ownerRows(db: Kysely<DB>,): Promise<OwnerRow[]> {
  const rows = await sql<OwnerRow>`
    SELECT chat_id, user_id, granted_by, granted_at, reason
    FROM chat_owners ORDER BY chat_id, user_id
  `.execute(db,);

  return rows.rows;
}

/**
 * @param db
 * @returns whether the chat_owners table exists in the schema
 */
async function hasTable(db: Kysely<DB>,): Promise<boolean> {
  const rows = await sql<{ name: string }>`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'chat_owners'
  `.execute(db,);

  return rows.rows.length > 0;
}

/**
 * Raw insert so the tests do not depend on the generated insert-helper
 * shape for the brand-new table.
 * @param db
 * @param chatId
 * @param userId
 * @param reason optional reason (length drives the CHECK case)
 */
async function insertOwner(
  db: Kysely<DB>,
  chatId: string,
  userId: string,
  reason?: string,
): Promise<void> {
  await sql`
    INSERT INTO chat_owners (chat_id, user_id, reason)
    VALUES (${chatId}, ${userId}, ${reason ?? null})
  `.execute(db,);
}

describe(MIGRATION, () => {
  test("backfills exactly one owners row per chat from chats.created_by", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      // insertChats needs the table (it seeds the creator row), so build
      // chats first, then drop to the pre-087 shape and let `up` backfill
      // from chats.created_by alone.
      const u1 = await insertUsers(db, `co-u1-${crypto.randomUUID()}`, "U1",);
      const u2 = await insertUsers(db, `co-u2-${crypto.randomUUID()}`, "U2",);
      const c1 = await insertChats(db, "Chat One", u1,);
      const c2 = await insertChats(db, "Chat Two", u1,);
      const c3 = await insertChats(db, "Chat Three", u2,);

      await down(db as unknown as UntypedDb,);
      expect(await hasTable(db,),).toBe(false,);

      await up(db as unknown as UntypedDb,);

      const byChat = (a: { chat_id: string }, b: { chat_id: string },) => a.chat_id.localeCompare(b.chat_id,);
      const rows = (await ownerRows(db,)).sort(byChat,);
      // One row per chat — u1 owns two chats, u2 one; no extras, no dupes.
      // Sort both sides: chat ids are random UUIDs, so insertion order is
      // not the ORDER BY chat_id order.
      const expected = [
        { chat_id: c1, user_id: u1, granted_by: null, granted_at: expect.any(String,), reason: null, },
        { chat_id: c2, user_id: u1, granted_by: null, granted_at: expect.any(String,), reason: null, },
        { chat_id: c3, user_id: u2, granted_by: null, granted_at: expect.any(String,), reason: null, },
      ].sort(byChat,);

      expect(rows,).toEqual(expected,);
      // granted_at is a real timestamp, not the empty default slip.
      for (const row of rows) {
        expect(row.granted_at.length,).toBeGreaterThan(0,);
      }
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });

  test("UNIQUE(chat_id, user_id) rejects the same owner twice", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      // insertChats seeds the creator's baseline row (production create
      // path) — the seeded row IS the first insert, so re-granting the
      // creator must reject as a duplicate.
      const u = await insertUsers(db, `co-dup-${crypto.randomUUID()}`, "Dup",);
      const c = await insertChats(db, "Dup Chat", u,);

      // The seeded creator row is the first insert — re-granting rejects.
      await expect(insertOwner(db, c, u,),).rejects.toThrow(/UNIQUE/i,);
      // A different user on the same chat, and the same user on a different
      // chat, are both fine — the constraint is the pair, not a column.
      const other = await insertUsers(db, `co-other-${crypto.randomUUID()}`, "Other",);
      const cOther = await insertChats(db, "Other Chat", other,);
      await insertOwner(db, c, other,);
      await insertOwner(db, cOther, u,);
      // Seed rows (c,u) + (cOther,other) plus the two explicit grants.
      expect((await ownerRows(db,)).length,).toBe(4,);
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });

  test("CHECK rejects a reason longer than 500 chars; 500 passes", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const u = await insertUsers(db, `co-reason-${crypto.randomUUID()}`, "Reason",);
      const r = await insertUsers(db, `co-reason2-${crypto.randomUUID()}`, "Reason2",);
      const cA = await insertChats(db, "Reason A", u,);
      const cB = await insertChats(db, "Reason B", u,);

      // A second user per chat: the seeded creator rows stay reason-free,
      // so the CHECK (not a UNIQUE conflict) decides these inserts.
      await expect(insertOwner(db, cA, r, "x".repeat(501,),),).rejects.toThrow(
        /ck_chat_owners_reason|CHECK/i,
      );

      await insertOwner(db, cB, r, "x".repeat(500,),);
      const rows = await ownerRows(db,);
      expect(rows.filter((r,) => r.reason?.length === 500),).toHaveLength(1,);
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });

  test("FK cascades: deleting a chat or an owner-user removes their rows", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      // Creator (chats.created_by FK blocks deleting them while chats exist)
      // and a co-owner whose only tie to the chat is the chat_owners row.
      const creator = await insertUsers(db, `co-cr-${crypto.randomUUID()}`, "Creator",);
      const coOwner = await insertUsers(db, `co-fk-${crypto.randomUUID()}`, "CoOwner",);
      const gone = await insertChats(db, "FK Chat", creator,);
      const kept = await insertChats(db, "Kept Chat", creator,);
      // insertChats seeds one creator row per chat (production create
      // path); the two explicit grants below bring the total to four.
      await insertOwner(db, gone, coOwner,);
      await insertOwner(db, kept, coOwner,);
      expect((await ownerRows(db,)).length,).toBe(4,);

      await sql`DELETE FROM chats WHERE id = ${gone}`.execute(db,);
      let rows = await ownerRows(db,);
      expect(rows,).toHaveLength(2,);
      expect(new Set(rows.map((r,) => r.chat_id),),).toEqual(new Set([kept,],),);

      // Deleting the co-owner cascades their surviving row away; the chats
      // themselves are untouched (creator column still references creator).
      await sql`DELETE FROM users WHERE id = ${coOwner}`.execute(db,);
      rows = await ownerRows(db,);
      expect(rows.map((r,) => [r.chat_id, r.user_id,]),).toEqual([[kept, creator,],],);
      const chatsLeft = await sql<{ id: string }>`SELECT id FROM chats ORDER BY id`.execute(db,);
      expect(chatsLeft.rows,).toHaveLength(1,);
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });

  test("down() restores the pre-087 shape, backfilled rows included", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const u = await insertUsers(db, `co-down-${crypto.randomUUID()}`, "Down",);
      await insertChats(db, "Down Chat", u,);

      // Re-run 084 against this chat: down() first (pre-087 shape), then up()
      // whose backfill creates exactly one row for it.
      await down(db as unknown as UntypedDb,);
      expect(await hasTable(db,),).toBe(false,);
      await up(db as unknown as UntypedDb,);
      expect((await ownerRows(db,)).length,).toBe(1,);

      // down() again drops the table WITH the backfilled row — the pre-087
      // shape is exactly "no table".
      await down(db as unknown as UntypedDb,);
      expect(await hasTable(db,),).toBe(false,);
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });
},);
