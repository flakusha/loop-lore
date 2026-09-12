// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Double rotation with FKs enforced.
 *
 * Regression: `rotation_history.new_key_id` references `chat_keys.id`, and
 * rotation renames that id in place — without ON UPDATE CASCADE the second
 * rotation on an audited chat died with SQLITE_CONSTRAINT_FOREIGNKEY
 * (key-distribution.ts rotation UPDATE). Both rotations must succeed and
 * each must leave an audit row.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { generateActorKey, } from "../actor-keys";
import { getChatKey, rotateKeyOnLeave, } from "../key-distribution";
import { getSmk, initSmk, } from "../smk";

const HEX = "b".repeat(64,);
const U1 = "cascade-u1";
const U2 = "cascade-u2";
const CHAT = "cascade-chat";

let db: Kysely<DB>;

async function insertUserAndActor(id: string,) {
  await db.insertInto("users",).values({
    id,
    username: id,
    display_name: id,
    role: "user",
    status: "active",
    settings: "{}",
    format_version: 0,
  },).execute();
  await db.insertInto("actors",).values({
    id,
    actor_type: "user",
    display_name: id,
    agent_type: "none",
    settings: "{}",
    import_spec: "raw",
    data_source_format: "json",
    data_raw: null,
    user_id: id,
    owner_id: id,
    format_version: 0,
    visibility: "private",
  },).execute();
}

beforeAll(async () => {
  createLogger();
  const handle = await createTestDb();
  db = handle.db;
  await initSmk({ serverEncryptionKey: HEX, required: false, compressThreshold: 128, compressAlgorithm: "gzip", },);
  await insertUserAndActor(U1,);
  await insertUserAndActor(U2,);
  await db.insertInto("chats",).values({
    id: CHAT,
    name: CHAT,
    type: "direct",
    mode: "direct",
    created_by: U1,
    encryption_level: "standard",
  },).execute();
  for (const u of [U1, U2,]) {
    await db.insertInto("chat_participants",).values({ chat_id: CHAT, actor_id: u, role_in_chat: "member", },)
      .execute();
  }
  const smk = getSmk()!;
  await generateActorKey({ database: db, actorId: U1, smk, },);
  await generateActorKey({ database: db, actorId: U2, smk, },);
  await getChatKey(db, CHAT,);
},);

afterAll(async () => {
  await initSmk({ required: false, compressThreshold: 128, compressAlgorithm: "gzip", },);
  await db.destroy();
},);

describe("double rotation with FKs enforced", () => {
  test("first rotation succeeds and writes one audit row", async () => {
    await rotateKeyOnLeave(db, CHAT, U2,);
    const rows = await db.selectFrom("rotation_history",).selectAll().execute();
    expect(rows.length,).toBe(1,);
  });
  test("second rotation succeeds and writes a second audit row", async () => {
    await rotateKeyOnLeave(db, CHAT, U1,);
    const rows = await db.selectFrom("rotation_history",).selectAll().orderBy("created_at",).execute();
    expect(rows.length,).toBe(2,);
  });
});
