// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Final-schema behavior for chat branch labels.
 *
 * The retired 032 migration made the DATABASE the arbiter of
 * `chat_branches (chat_id, name)`; in the 14-file baseline that unique index
 * ships inline. The migration-time rename/collision-walk loop is unreachable
 * against a final-schema database, so these tests assert the shipped key is
 * live: one label per chat, the same label allowed in a different chat.
 */
import { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Kysely, sql, } from "kysely";

import { createSqliteDialect, } from "./index";
import { getMigrationFiles, } from "./migrate";

/** Apply the 14-file baseline to this test's isolated in-memory DB. */
async function applyBaseline(database: Kysely<unknown>,): Promise<void> {
  for (const migration of Object.values(await getMigrationFiles(),)) {
    await migration.up(database,);
  }
}

describe("chat branch name unique (final schema)", () => {
  let raw: Database;
  let db: Kysely<unknown>;

  beforeEach(async () => {
    raw = new Database(":memory:",);
    db = new Kysely({ dialect: createSqliteDialect(raw,), },);
    await applyBaseline(db,);
    // Seed the FK chain chat_branches -> messages -> chats/actors -> users.
    await sql`INSERT INTO users (id, username, display_name) VALUES ('owner-1', 'owner-1', 'Owner One')`.execute(db,);
    await sql`INSERT INTO actors (id, display_name) VALUES ('actor-1', 'Actor One')`.execute(db,);
    await sql`INSERT INTO chats (id, name, created_by) VALUES
      ('chat-a', 'Chat A', 'owner-1'),
      ('chat-b', 'Chat B', 'owner-1')`.execute(db,);

    await sql`INSERT INTO messages (id, chat_id, actor_id, role, content) VALUES
      ('msg-a', 'chat-a', 'actor-1', 'user', 'hello'),
      ('msg-b', 'chat-b', 'actor-1', 'user', 'hello')`.execute(db,);
  },);

  afterEach(async () => {
    await db.destroy();
    raw.close();
  },);

  async function insertBranch(id: string, chatId: string, name: string,): Promise<void> {
    const parentMessageId = `msg-${chatId.replace("chat-", "",)}`;
    await sql`INSERT INTO chat_branches (id, chat_id, parent_message_id, name, created_at)
      VALUES (${id}, ${chatId}, ${parentMessageId}, ${name}, datetime('now'))`.execute(db,);
  }

  test("the unique (chat_id, name) index is present", () => {
    const rows = raw
      .query("SELECT name, \"unique\" AS isUnique FROM pragma_index_list('chat_branches')",)
      .all() as { name: string; isUnique: number }[];

    expect(rows.find((r,) => r.name === "uq_chat_branches_chat_name")?.isUnique,).toBe(1,);
  });

  test("a racing second fork with the same label in one chat is rejected", async () => {
    await insertBranch("a-oldest", "chat-a", "Branch 1",);
    await expect(insertBranch("b-racing-fork", "chat-a", "Branch 1",),).rejects.toThrow(/UNIQUE/i,);
  });

  test("the same label in a different chat is still allowed", async () => {
    await insertBranch("a-first", "chat-a", "Branch 1",);
    await insertBranch("b-other-chat", "chat-b", "Branch 1",);
    const { rows, } = await sql<{ id: string; chat_id: string }>`SELECT id, chat_id FROM chat_branches ORDER BY id`
      .execute(db,);

    expect(rows,).toEqual([
      { id: "a-first", chat_id: "chat-a", },
      { id: "b-other-chat", chat_id: "chat-b", },
    ],);
  });
});
