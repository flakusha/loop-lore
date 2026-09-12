// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for crypto/key-rotation/rotation-history.ts —
 * `recordRotationAuditLeave` helper. Pins the best-effort audit
 * contract: the helper MUST NOT throw on insert failure, MUST log
 * via `log().error`, and MUST persist the audit row when the
 * insert succeeds.
 */
import { afterAll, beforeEach, describe, expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { recordRotationAuditLeave, } from "./rotation-history";

let db: Kysely<DB>;

beforeEach(async () => {
  const handle = await createTestDb();
  db = handle.db;
},);

afterAll(async () => {
  await db.destroy();
},);

/**
 * Seed the FK targets `rotation_history` needs: one chat, one actor,
 * one chat_key. Without these the happy-path insert raises a FK
 * violation, which is what case 3 wants — so cases 1+2 call this.
 */
const OWNER_ID = "user-owner";
const CHAT_ID = "chat-1";
const ACTOR_ID = "actor-1";
const OLD_KEY_ID = "key-old";
const NEW_KEY_ID = "key-new";

/**
 * Insert the `users` row that `chats.created_by` references.
 */
async function insertUser(id: string,): Promise<void> {
  await db
    .insertInto("users",)
    .values({
      id,
      username: id,
      display_name: id,
      role: "user",
      status: "active",
      settings: "{}",
      format_version: 0,
    },)
    .execute();
}

/**
 * Insert the chat that `rotation_history.chat_id` references.
 */
async function insertChat(id: string,): Promise<void> {
  await db
    .insertInto("chats",)
    .values({
      id,
      name: id,
      type: "direct",
      mode: "direct",
      created_by: OWNER_ID,
      encryption_level: "standard",
    },)
    .execute();
}

/**
 * Insert the actor that `rotation_history.actor_id` references.
 */
async function insertActor(id: string,): Promise<void> {
  await db
    .insertInto("actors",)
    .values({
      id,
      actor_type: "character",
      display_name: id,
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
}

/**
 * Seed the FK targets `rotation_history` needs. Only `new_key_id`
 * references `chat_keys.id` (`old_key_id` is plain text); insert the
 * post-rotation key so the helper's insert succeeds.
 */
async function seedFixtures(): Promise<{ chatId: string; actorId: string; oldKeyId: string; newKeyId: string }> {
  await insertUser(OWNER_ID,);
  await insertChat(CHAT_ID,);
  await insertActor(ACTOR_ID,);
  // One chat_keys row: the POST-rotation key (`new_key_id` FK target).
  // `chat_keys.chat_id` is UNIQUE and `old_key_id` carries no FK, so the
  // pre-rotation id exists only as a string, mirroring a real rotation
  // (which UPDATEs `chat_keys.id` in place).
  await db
    .insertInto("chat_keys",)
    .values({ id: NEW_KEY_ID, chat_id: CHAT_ID, encrypted_chat_key: "new", expires_at: null, },)
    .execute();
  return { chatId: CHAT_ID, actorId: ACTOR_ID, oldKeyId: OLD_KEY_ID, newKeyId: NEW_KEY_ID, };
}

describe("recordRotationAuditLeave", () => {
  test("inserts audit row with actorId set", async () => {
    const { chatId, actorId, oldKeyId, newKeyId, } = await seedFixtures();
    await recordRotationAuditLeave(db, {
      chatId,
      actorId,
      oldKeyId,
      newKeyId,
      messagesReEncrypted: 7,
    },);
    const rows = await db.selectFrom("rotation_history",).selectAll().execute();
    expect(rows.length,).toBe(1,);
    expect(rows[0]!.chat_id,).toBe(chatId,);
    expect(rows[0]!.actor_id,).toBe(actorId,);
    expect(rows[0]!.reason,).toBe("leave",);
    expect(rows[0]!.old_key_id,).toBe(oldKeyId,);
    expect(rows[0]!.new_key_id,).toBe(newKeyId,);
    expect(rows[0]!.messages_re_encrypted,).toBe(7,);
    expect(typeof rows[0]!.id,).toBe("string",);
    expect(rows[0]!.id.length,).toBeGreaterThan(0,);
    expect(rows[0]!.created_at,).toBeTruthy();
  });

  test("inserts audit row with actorId null", async () => {
    const { chatId, oldKeyId, newKeyId, } = await seedFixtures();
    await recordRotationAuditLeave(db, {
      chatId,
      actorId: null,
      oldKeyId,
      newKeyId,
      messagesReEncrypted: 0,
    },);
    const rows = await db.selectFrom("rotation_history",).selectAll().execute();
    expect(rows.length,).toBe(1,);
    expect(rows[0]!.actor_id,).toBeNull();
  });

  test("catches FK violation without rethrowing", async () => {
    // No seedFixtures() call — chat_id FK violation will trigger the catch.
    // The helper MUST NOT throw; the caller continues. We only assert
    // no-throw + zero rows.
    await expect(
      recordRotationAuditLeave(db, {
        chatId: "nonexistent-chat",
        actorId: null,
        oldKeyId: "k",
        newKeyId: "k",
        messagesReEncrypted: 0,
      },),
    ).resolves.toBeUndefined();
    const rows = await db.selectFrom("rotation_history",).selectAll().execute();
    expect(rows.length,).toBe(0,);
  });

  test("wraps non-Error rejections in an Error before logging", async () => {
    // Force a non-Error throw to exercise the
    // `auditErr instanceof Error ? auditErr : new Error(String(auditErr))`
    // ternary inside the catch block. We monkey-patch db.insertInto so the
    // first call resolves normally (for the chain to assemble) but the
    // terminal `.execute()` rejects with a plain string.
    const originalInsertInto = db.insertInto.bind(db,);
    const stubInsertInto = mock((table: unknown,) => {
      const chain = originalInsertInto(table as never,);
      return {
        ...chain,
        execute: async () => {
          throw "not-an-error-instance" as unknown;
        },
      };
    },);
    (db as unknown as { insertInto: (table: unknown,) => unknown }).insertInto = stubInsertInto;
    await expect(
      recordRotationAuditLeave(db, {
        chatId: "x",
        actorId: null,
        oldKeyId: "k",
        newKeyId: "k",
        messagesReEncrypted: 0,
      },),
    ).resolves.toBeUndefined();
    // Restore so afterAll cleanup works cleanly.
    (db as unknown as { insertInto: typeof originalInsertInto }).insertInto = originalInsertInto;
  });
});
