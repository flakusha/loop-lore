/**
 * Tests for views/chats serve functions (list + search).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { type ChatListViewer, serveChatsListDb, serveChatsSearch, } from "./chats";

/** The seeded owner, and the viewer every seeded chat belongs to. */
const OWNER: ChatListViewer = { userId: "owner", isAdmin: false, };

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
    const res = await serveChatsListDb(db, new URLSearchParams(), OWNER,);
    const html = await res.text();
    expect(html,).toContain("chat-pin",);
    expect(html,).toContain("chat-alpha",);
  });

  test("list honors pageSize", async () => {
    const res = await serveChatsListDb(db, new URLSearchParams({ pageSize: "2", },), OWNER,);
    const html = await res.text();
    expect(html,).toContain("data-page=",);
  });

  test("search matches name substring", async () => {
    const res = await serveChatsSearch(db, new URLSearchParams({ q: "alpha", },), OWNER,);
    const html = await res.text();
    expect(html,).toContain("chat-alpha",);
    expect(html,).not.toContain("chat-beta",);
  });

  test("search filters by world", async () => {
    const res = await serveChatsSearch(db, new URLSearchParams({ world: "world-1", },), OWNER,);
    const html = await res.text();
    expect(html,).toContain("chat-alpha",);
    expect(html,).not.toContain("chat-beta",);
  });

  test("search filters by type", async () => {
    const res = await serveChatsSearch(db, new URLSearchParams({ type: "direct", },), OWNER,);
    const html = await res.text();
    expect(html,).toContain("chat-alpha",);
  });

  test("search sorts by name", async () => {
    const res = await serveChatsSearch(db, new URLSearchParams({ sort: "name", },), OWNER,);
    const html = await res.text();
    expect(html.indexOf("chat-alpha",),).toBeLessThan(html.indexOf("chat-beta",),);
  });

  test("no matches renders empty state", async () => {
    const res = await serveChatsSearch(db, new URLSearchParams({ q: "zzz", },), OWNER,);
    const html = await res.text();
    expect(html,).toContain("No chats match your search",);
  });

  test("list and search only render the viewer's chats", async () => {
    const res = await serveChatsListDb(db, new URLSearchParams(), { userId: "intruder", isAdmin: false, },);
    const html = await res.text();
    expect(html,).not.toContain("chat-pin",);
    expect(html,).not.toContain("chat-alpha",);
    expect(html,).not.toContain("chat-beta",);
    expect(html,).toContain("No chats yet",);
  });

  test("a chat the viewer participates in but did not create is listed", async () => {
    await insertActors(db, "Guest", { id: "guest" as never, owner_id: "owner", },);
    await insertChatParticipants(db, "chat-beta", "guest",);
    const res = await serveChatsListDb(db, new URLSearchParams(), { userId: "guest", isAdmin: false, },);
    expect(await res.text(),).toContain("chat-beta",);
  });
});
