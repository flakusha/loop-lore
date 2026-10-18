/**
 * Tests for views/chats serve functions (list + search).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertChats, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { serveChatsListDb, serveChatsSearch, } from "./chats";

describe("views/chats", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: "owner" as never, },);
    await insertWorlds(db, "owner", "Test World", { id: "world-1" as never, },);
    await insertChats(db, "Pinned Chat", "owner", { id: "chat-pin" as never, is_pinned: "1" as never, },);
    await insertChats(db, "Alpha Chat", "owner", { id: "chat-alpha" as never, world_id: "world-1", },);
    await insertChats(db, "Beta Chat", "owner", { id: "chat-beta" as never, },);
  },);

  afterAll(() => sqlite.close());

  test("list renders all chats", async () => {
    const res = await serveChatsListDb(db, new URLSearchParams(),);
    const html = await res.text();
    expect(html,).toContain("chat-pin",);
    expect(html,).toContain("chat-alpha",);
  });

  test("list honors pageSize", async () => {
    const res = await serveChatsListDb(db, new URLSearchParams({ pageSize: "2", },),);
    const html = await res.text();
    expect(html,).toContain("data-page=",);
  });

  test("search matches name substring", async () => {
    const res = await serveChatsSearch(db, new URLSearchParams({ q: "alpha", },),);
    const html = await res.text();
    expect(html,).toContain("chat-alpha",);
    expect(html,).not.toContain("chat-beta",);
  });

  test("search filters by world", async () => {
    const res = await serveChatsSearch(db, new URLSearchParams({ world: "world-1", },),);
    const html = await res.text();
    expect(html,).toContain("chat-alpha",);
    expect(html,).not.toContain("chat-beta",);
  });

  test("search filters by type", async () => {
    const res = await serveChatsSearch(db, new URLSearchParams({ type: "direct", },),);
    const html = await res.text();
    expect(html,).toContain("chat-alpha",);
  });

  test("search sorts by name", async () => {
    const res = await serveChatsSearch(db, new URLSearchParams({ sort: "name", },),);
    const html = await res.text();
    expect(html.indexOf("chat-alpha",),).toBeLessThan(html.indexOf("chat-beta",),);
  });

  test("no matches renders empty state", async () => {
    const res = await serveChatsSearch(db, new URLSearchParams({ q: "zzz", },),);
    const html = await res.text();
    expect(html,).toContain("No chats match your search",);
  });
});
