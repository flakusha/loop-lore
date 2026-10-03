// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Migration 032 — unique index on `chat_branches (chat_id, name)`.
 *
 * Before 032 the label was only arbitrated by an unlocked `SELECT COUNT(*)`
 * pre-read in `nextAutoName`, so two concurrent forks in one chat both
 * computed "Branch N" and both inserts succeeded. 032 makes the DATABASE the
 * arbiter — and first renames the same-named siblings a raced database already
 * accumulated, because `CREATE UNIQUE INDEX` aborts on those and would leave
 * the migration stuck half-applied. Duplicates are renamed, never deleted: a
 * branch row is a user-visible fork point.
 *
 * The rename loop is the only code path a clean database never reaches
 * (`dupes.rows` is empty), so it is what this file forces.
 */
import { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, spyOn, test, } from "bun:test";
import { Kysely, sql, } from "kysely";

import { createLogger, } from "../logger";
import { createSqliteDialect, } from "./index";
import { getMigrationFiles, } from "./migrate";
import type { DB, } from "./schema";

const MIGRATION = "032_chat_branches_name_unique";

function makeInMemoryDb(): { kysely: Kysely<DB>; raw: Database } {
  const raw = new Database(":memory:");
  const kysely = new Kysely<DB>({ dialect: createSqliteDialect(raw,), },);
  return { kysely, raw, };
}

describe(MIGRATION, () => {
  let db: Kysely<DB>;
  let raw: Database;

  beforeEach(async () => {
    try {
      createLogger({ level: "error", },);
    } catch {
      // Logger already initialized — ignore.
    }
    const fresh = makeInMemoryDb();
    db = fresh.kysely;
    raw = fresh.raw;
    // Apply every migration except 032, so chat_branches is in its
    // pre-migration shape: bare `name` with no dedupe index, duplicates
    // allowed within a chat.
    const migrations = await getMigrationFiles();
    for (const name of Object.keys(migrations).sort()) {
      if (name === MIGRATION) { continue; }
      await migrations[name]!.up(db,);
    }
    // chat_branches.parent_message_id references messages, which in turn
    // references chats and actors — seed the whole FK chain.
    await sql`INSERT INTO users (id, username, display_name)
      VALUES ('owner-1', 'owner-1', 'Owner One')`.execute(db,);
    await sql`INSERT INTO actors (id, display_name)
      VALUES ('actor-1', 'Actor One')`.execute(db,);
    await sql`INSERT INTO chats (id, name, created_by) VALUES
      ('chat-a', 'Chat A', 'owner-1'),
      ('chat-b', 'Chat B', 'owner-1'),
      ('chat-c', 'Chat C', 'owner-1')`.execute(db,);
    await sql`INSERT INTO messages (id, chat_id, actor_id, role, content) VALUES
      ('msg-a', 'chat-a', 'actor-1', 'user', 'hello'),
      ('msg-b', 'chat-b', 'actor-1', 'user', 'hello'),
      ('msg-c', 'chat-c', 'actor-1', 'user', 'hello')`.execute(db,);
  },);

  afterEach(async () => {
    await db.destroy();
    raw.close();
  },);

  /**
   * @param id branch id
   * @param chatId owning chat — the first half of the unique key
   * @param name branch label — the second half
   * @param createdAt insertion timestamp; the oldest row of a group keeps the name
   */
  async function insertBranch(
    id: string,
    chatId: string,
    name: string,
    createdAt: string,
  ): Promise<void> {
    const parentMessageId = `msg-${chatId.replace("chat-", "")}`;
    await sql`INSERT INTO chat_branches (id, chat_id, parent_message_id, name, created_at)
      VALUES (${id}, ${chatId}, ${parentMessageId}, ${name}, ${createdAt})`.execute(db,);
  }

  /**
   * @param chatId owning chat
   * @param name branch label
   */
  async function namesIn(chatId: string, name: string,): Promise<string[]> {
    const rows = await sql<{ id: string }>`SELECT id FROM chat_branches
      WHERE chat_id = ${chatId} AND name = ${name} ORDER BY id`.execute(db,);
    return rows.rows.map((r,) => r.id,);
  }

  /** @param name branch label */
  async function idWithName(chatId: string, name: string,): Promise<string | undefined> {
    const rows = await sql<{ id: string }>`SELECT id FROM chat_branches
      WHERE chat_id = ${chatId} AND name = ${name}`.execute(db,);
    return rows.rows[0]?.id;
  }

  test("renames same-named siblings to the oldest, warns, then enforces (chat_id, name)", async () => {
    // Three branches in one chat sharing a label — the shape the racing
    // nextAutoName pre-read produced.
    await insertBranch("a-oldest", "chat-a", "Branch 1", "2026-01-01 00:00:00",);
    await insertBranch("b-middle", "chat-a", "Branch 1", "2026-01-02 00:00:00",);
    await insertBranch("c-newest", "chat-a", "Branch 1", "2026-01-03 00:00:00",);
    // Same label in a DIFFERENT chat: a distinct key, must survive untouched.
    await insertBranch("d-other-chat", "chat-b", "Branch 1", "2026-01-01 00:00:00",);
    // Not part of a duplicate group — must keep its name verbatim.
    await insertBranch("e-unique", "chat-a", "Branch 9", "2026-01-01 00:00:00",);

    const warnSpy = spyOn(process, "emitWarning",).mockImplementation(() => {},);
    let warnings: string[] = [];
    try {
      const migrations = await getMigrationFiles();
      const migration = migrations[MIGRATION];
      if (!migration) { throw new Error("migration 032 not registered",); }
      await migration.up(db,);
      // Read the calls before restoring — mockRestore() clears them.
      warnings = warnSpy.mock.calls.map((c,) => String(c[0],),);
    } finally {
      warnSpy.mockRestore();
    }

    // The oldest row keeps the name; the losers are RENAMED, not deleted —
    // dropping one would silently remove a fork point the user can see.
    expect(await namesIn("chat-a", "Branch 1",),).toEqual(["a-oldest",],);
    expect(await idWithName("chat-a", "Branch 1 (2)",),).toBe("b-middle",);
    expect(await idWithName("chat-a", "Branch 1 (3)",),).toBe("c-newest",);
    // Nothing is lost: all three rows still exist, under distinct names.
    const survivors = await sql<{ id: string }>`SELECT id FROM chat_branches
      WHERE chat_id = 'chat-a' ORDER BY id`.execute(db,);
    expect(survivors.rows.map((r,) => r.id,),).toEqual(["a-oldest", "b-middle", "c-newest", "e-unique",],);

    // The key is per-chat, so chat-b keeps its own "Branch 1".
    expect(await namesIn("chat-b", "Branch 1",),).toEqual(["d-other-chat",],);
    // A row outside a duplicate group is untouched.
    expect(await idWithName("chat-a", "Branch 9",),).toBe("e-unique",);

    // One warning per collapsed group, naming the chat and the row count.
    expect(warnings,).toHaveLength(1,);
    expect(warnings.some((w,) => /chat chat-a has 3 branches named "Branch 1"/.test(w,)),).toBe(true,);

    // The index exists ...
    const indexRows = raw.query("PRAGMA index_list(chat_branches)",).all() as { name: string; unique: number }[];
    expect(indexRows.map((r,) => r.name,),).toContain("uq_chat_branches_chat_name",);
    expect(indexRows.find((r,) => r.name === "uq_chat_branches_chat_name",)?.unique,).toBe(1,);

    // ... and it is enforced: a racing second fork in the same chat now aborts.
    await expect(
      insertBranch("f-racing-fork", "chat-a", "Branch 1", "2026-01-04 00:00:00",),
    ).rejects.toThrow(/UNIQUE/i,);
    // The same label in a different chat is still allowed — chat_id is the
    // first half of the key.
    await insertBranch("g-other-chat-ok", "chat-c", "Branch 1", "2026-01-05 00:00:00",);
    expect(await namesIn("chat-c", "Branch 1",),).toEqual(["g-other-chat-ok",],);
  },);

  test("skips rename candidates already taken instead of colliding with them", async () => {
    // `Branch 1 (2)` is already occupied by a DIFFERENT branch, so the naive
    // candidate for the second duplicate collides and the loop must walk on
    // to the next free suffix.
    await insertBranch("a-oldest", "chat-a", "Branch 1", "2026-01-01 00:00:00",);
    await insertBranch("b-middle", "chat-a", "Branch 1", "2026-01-02 00:00:00",);
    await insertBranch("c-newest", "chat-a", "Branch 1", "2026-01-03 00:00:00",);
    await insertBranch("d-squatter", "chat-a", "Branch 1 (2)", "2026-01-01 00:00:00",);

    const warnSpy = spyOn(process, "emitWarning",).mockImplementation(() => {},);
    try {
      const migrations = await getMigrationFiles();
      const migration = migrations[MIGRATION];
      if (!migration) { throw new Error("migration 032 not registered",); }
      await migration.up(db,);
    } finally {
      warnSpy.mockRestore();
    }

    // The squatter keeps `Branch 1 (2)`; the first duplicate lands on (3).
    expect(await idWithName("chat-a", "Branch 1 (2)",),).toBe("d-squatter",);
    expect(await idWithName("chat-a", "Branch 1 (3)",),).toBe("b-middle",);
    // The second duplicate's naive `Branch 1 (3)` was taken by the row above,
    // so it walks on to (4) rather than overwriting it.
    expect(await idWithName("chat-a", "Branch 1 (4)",),).toBe("c-newest",);
    expect(await namesIn("chat-a", "Branch 1",),).toEqual(["a-oldest",],);
  },);

  test("down() drops the unique index and restores the duplicate-tolerant shape", async () => {
    const migrations = await getMigrationFiles();
    const migration = migrations[MIGRATION]!;
    await migration.up(db,);
    if (!migration.down) { throw new Error("migration 032 has no down",); }
    await migration.down(db,);

    // After down(), two same-named branches in one chat must insert again —
    // the pre-032 behaviour we are reverting to.
    await insertBranch("row-x", "chat-a", "Branch 1", "2026-03-01 00:00:00",);
    await insertBranch("row-y", "chat-a", "Branch 1", "2026-03-01 00:00:01",);
    expect(await namesIn("chat-a", "Branch 1",),).toEqual(["row-x", "row-y",],);

    // The index is gone, not merely non-enforcing.
    const indexRows = raw.query("PRAGMA index_list(chat_branches)",).all() as { name: string }[];
    expect(indexRows.map((r,) => r.name,),).not.toContain("uq_chat_branches_chat_name",);
  },);
});
