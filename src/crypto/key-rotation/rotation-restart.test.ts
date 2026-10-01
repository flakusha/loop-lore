// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * AC7 restart-survival test (TASK-chat-feature-encryption-key-rotation).
 *
 * `rotation-history.test.ts` pins the audit-row insert + best-effort logging
 * against an in-memory DB, which cannot prove durability. This suite runs the
 * same audit write against a FILE-backed SQLite database, closes the handle
 * (simulating a process restart), reopens a fresh Kysely instance on the same
 * file — including a fresh `runMigrations` pass, exactly what boot does — and
 * asserts the `rotation_history` row reads back intact.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Database, } from "bun:sqlite";
import { mkdirSync, mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { Kysely, } from "kysely";
import { createSqliteDialect, } from "../../db/index";
import { runMigrations, } from "../../db/migrate";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { recordRotationAuditLeave, } from "./rotation-history";

createLogger({ level: "error", },);

const OWNER_ID = "restart-user";
const CHAT_ID = "restart-chat";
const ACTOR_ID = "restart-actor";
const OLD_KEY_ID = "restart-key-old";
const NEW_KEY_ID = "restart-key-new";

let restartDir: string;
let dbPath: string;
let db: Kysely<DB> | null = null;

/** Open (or reopen) the file-backed DB with migrations applied — boot path. */
async function openDb(): Promise<Kysely<DB>> {
  const sqlite = new Database(dbPath,);
  const handle = new Kysely<DB>({ dialect: createSqliteDialect(sqlite,), },);
  await runMigrations(handle,);
  return handle;
}

/** Close the current handle the way a process exit would. */
async function closeDb(): Promise<void> {
  if (!db) { return; }
  await db.destroy();
  db = null;
}

/** Seed the FK targets `rotation_history` needs (users/chats/actors/chat_keys). */
async function seedFixtures(database: Kysely<DB>,): Promise<void> {
  await database
    .insertInto("users",)
    .values({
      id: OWNER_ID,
      username: OWNER_ID,
      display_name: OWNER_ID,
      role: "user",
      status: "active",
      settings: "{}",
      format_version: 0,
    },)
    .execute();
  await database
    .insertInto("chats",)
    .values({
      id: CHAT_ID,
      name: CHAT_ID,
      type: "direct",
      mode: "direct",
      created_by: OWNER_ID,
      encryption_level: "standard",
    },)
    .execute();
  await database
    .insertInto("actors",)
    .values({
      id: ACTOR_ID,
      actor_type: "character",
      display_name: ACTOR_ID,
      agent_type: "none",
      settings: "{}",
      import_spec: "raw",
      data_source_format: "json",
      data_raw: null,
      user_id: null,
      owner_id: OWNER_ID,
      format_version: 0,
      visibility: "private",
    },)
    .execute();
  await database
    .insertInto("chat_keys",)
    .values({ id: NEW_KEY_ID, chat_id: CHAT_ID, encrypted_chat_key: "new", expires_at: null, },)
    .execute();
}

beforeAll(async () => {
  restartDir = mkdtempSync(join(tmpdir(), "ll-rotation-restart-",),);
  mkdirSync(join(restartDir, "data",), { recursive: true, },);
  dbPath = join(restartDir, "data", "loop-lore.db",);
});

afterAll(async () => {
  await closeDb();
  rmSync(restartDir, { recursive: true, force: true, },);
});

describe("rotation history survives a restart (AC7)", () => {
  test("audit row written before restart is intact after reopening the file DB", async () => {
    // ── Session 1: boot, migrate, seed, rotate-audit. ──
    db = await openDb();
    await seedFixtures(db,);
    await recordRotationAuditLeave(db, {
      chatId: CHAT_ID,
      actorId: ACTOR_ID,
      oldKeyId: OLD_KEY_ID,
      newKeyId: NEW_KEY_ID,
      messagesReEncrypted: 3,
    },);

    const before = await db
      .selectFrom("rotation_history",)
      .selectAll()
      .where("chat_id", "=", CHAT_ID,)
      .execute();
    expect(before,).toHaveLength(1,);

    // ── Restart: drop the handle entirely. Nothing in-process survives. ──
    await closeDb();

    // ── Session 2: fresh handle + migrations on the same file. ──
    db = await openDb();
    const rows = await db
      .selectFrom("rotation_history",)
      .selectAll()
      .where("chat_id", "=", CHAT_ID,)
      .execute();

    expect(rows,).toHaveLength(1,);
    const row = rows[0]!;
    expect(row.actor_id,).toBe(ACTOR_ID,);
    expect(row.reason,).toBe("leave",);
    expect(row.old_key_id,).toBe(OLD_KEY_ID,);
    expect(row.new_key_id,).toBe(NEW_KEY_ID,);
    expect(row.messages_re_encrypted,).toBe(3,);
    expect(row.created_at,).not.toBe("",);
  }, 30_000,);

  test("audit rows accumulate append-only across restarts", async () => {
    // Second rotation in the same chat: two rows total after reopen — the
    // restart boundary neither dedupes nor drops history.
    await recordRotationAuditLeave(db!, {
      chatId: CHAT_ID,
      actorId: null,
      oldKeyId: NEW_KEY_ID,
      newKeyId: NEW_KEY_ID,
      messagesReEncrypted: 1,
    },);

    await closeDb();
    db = await openDb();

    const rows = await db
      .selectFrom("rotation_history",)
      .select(["reason", "messages_re_encrypted",],)
      .where("chat_id", "=", CHAT_ID,)
      .orderBy("created_at", "asc",)
      .execute();
    expect(rows,).toHaveLength(2,);
    expect(rows.every((r,) => r.reason === "leave",),).toBe(true,);
    expect(rows.map((r,) => r.messages_re_encrypted,),).toEqual([3, 1,],);
  }, 30_000,);
});
