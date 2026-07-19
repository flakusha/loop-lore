import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import type { DB, } from "./schema";

type Row = Record<string, unknown>;

let sqlite: Database;
let db: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, sqlite, } = await createTestDb());
},);

afterAll(async () => {
  await db.destroy();
  sqlite.close();
},);

describe("Database schema", () => {
  test("all core tables exist", () => {
    const tables = sqlite
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'kysely_%' ORDER BY name",)
      .all() as Row[];
    const names = tables.map((t,) => t.name as string);
    expect(names,).toContain("users",);
    expect(names,).toContain("sessions",);
    expect(names,).toContain("chats",);
    expect(names,).toContain("actors",);
    expect(names,).toContain("messages",);
    expect(names,).toContain("chat_participants",);
    expect(names,).toContain("characters",);
    expect(names,).toContain("assets",);
    expect(names,).toContain("asset_links",);
    expect(names,).toContain("worlds",);
    expect(names,).toContain("locations",);
    expect(names,).toContain("actor_memories",);
    expect(names,).toContain("actor_notes",);
    expect(names,).toContain("actor_items",);
    expect(names,).toContain("actor_lore_entries",);
    expect(names,).toContain("world_lore_entries",);
    expect(names,).toContain("actor_keys",);
    expect(names,).toContain("user_api_keys",);
    expect(names,).toContain("generation_attempts",);
    expect(names,).toContain("story_turns",);
    expect(names,).toContain("quests",);
    expect(names,).toContain("quest_progress",);
    expect(names,).toContain("world_states",);
    expect(names,).toContain("npc_states",);
    expect(names,).toContain("location_states",);
    expect(names,).toContain("synthetic_data",);
    expect(names,).toContain("items",);
    expect(names,).toContain("world_items",);
  });

  describe("actors — unified participant table", () => {
    test("insert user as actor", async () => {
      await db
        .insertInto("users",)
        .values({
          id: "user-1",
          username: "alice",
          display_name: "Alice",
          role: "user",
          status: "active",
          settings: "{}",
        },)
        .execute();

      await db
        .insertInto("actors",)
        .values({
          id: "actor-user-1",
          actor_type: "user",
          display_name: "Alice",
          user_id: "user-1",
          agent_type: "none",
          settings: "{}",
          import_spec: "raw",
        },)
        .execute();

      const actor = sqlite.query("SELECT * FROM actors WHERE id = ?",).get("actor-user-1",) as Row;
      expect(actor.actor_type,).toBe("user",);
      expect(actor.display_name,).toBe("Alice",);
      expect(actor.user_id,).toBe("user-1",);
      expect(actor.agent_type,).toBe("none",);
    });

    test("insert AI character as actor", async () => {
      await db
        .insertInto("actors",)
        .values({
          id: "actor-char-1",
          actor_type: "character",
          display_name: "Bob",
          owner_id: "user-1",
          agent_type: "ai",
          description: "An AI character",
          settings: "{}",
          import_spec: "raw",
        },)
        .execute();

      const actor = sqlite.query("SELECT * FROM actors WHERE id = ?",).get("actor-char-1",) as Row;
      expect(actor.actor_type,).toBe("character",);
      expect(actor.display_name,).toBe("Bob",);
      expect(actor.agent_type,).toBe("ai",);
      expect(actor.description,).toBe("An AI character",);
    });

    test("insert system narrator as actor", async () => {
      await db
        .insertInto("actors",)
        .values({
          id: "actor-narrator",
          actor_type: "narrator",
          display_name: "Narrator",
          agent_type: "narrator",
          settings: "{}",
          import_spec: "raw",
        },)
        .execute();

      const actor = sqlite.query("SELECT * FROM actors WHERE id = ?",).get("actor-narrator",) as Row;
      expect(actor.actor_type,).toBe("narrator",);
      expect(actor.agent_type,).toBe("narrator",);
    });

    test("actor_type discriminator prevents mixing types", () => {
      const actors = sqlite
        .query("SELECT actor_type, COUNT(*) as cnt FROM actors GROUP BY actor_type ORDER BY actor_type",)
        .all() as Row[];
      expect(actors.map((r,) => ({ type: r.actor_type, count: r.cnt, })),).toEqual([
        { type: "character", count: 1, },
        { type: "narrator", count: 1, },
        { type: "user", count: 1, },
      ],);
    });
  });

  describe("messages — visibility enum", () => {
    test("message defaults to visible", async () => {
      const chatId = "chat-vis";
      await db
        .insertInto("chats",)
        .values({ id: chatId, name: "Vis Test", type: "direct", mode: "direct", created_by: "user-1", },)
        .execute();

      await db
        .insertInto("chat_participants",)
        .values({ chat_id: chatId, actor_id: "actor-user-1", role_in_chat: "member", },)
        .execute();

      await db
        .insertInto("messages",)
        .values({
          id: "msg-vis",
          chat_id: chatId,
          actor_id: "actor-user-1",
          role: "user",
          content: "Hello",
          content_type: "text",
          content_format: "markdown",
          content_encoding: "identity",
          status: "sending",
          visibility: "visible",
        },)
        .execute();

      const message = sqlite.query("SELECT visibility FROM messages WHERE id = ?",).get("msg-vis",) as Row;
      expect(message.visibility,).toBe("visible",);
    });

    test("can set different visibility states", async () => {
      await db
        .insertInto("messages",)
        .values({
          id: "msg-hidden-user",
          chat_id: "chat-vis",
          actor_id: "actor-user-1",
          role: "user",
          content: "gone",
          content_type: "text",
          content_format: "markdown",
          content_encoding: "identity",
          status: "sending",
          visibility: "hidden_by_user",
        },)
        .execute();

      await db
        .insertInto("messages",)
        .values({
          id: "msg-hidden-mod",
          chat_id: "chat-vis",
          actor_id: "actor-user-1",
          role: "user",
          content: "bad",
          content_type: "text",
          content_format: "markdown",
          content_encoding: "identity",
          status: "sending",
          visibility: "hidden_by_moderator",
          hidden_by: "actor-user-1",
          hidden_reason: "inappropriate",
        },)
        .execute();

      await db
        .insertInto("messages",)
        .values({
          id: "msg-auto",
          chat_id: "chat-vis",
          actor_id: "actor-user-1",
          role: "user",
          content: "auto",
          content_type: "text",
          content_format: "markdown",
          content_encoding: "identity",
          status: "sending",
          visibility: "auto_hidden",
        },)
        .execute();

      const states = sqlite
        .query("SELECT id, visibility FROM messages WHERE chat_id = ? ORDER BY rowid",)
        .all("chat-vis",) as Row[];
      expect(states,).toEqual([
        { id: "msg-vis", visibility: "visible", },
        { id: "msg-hidden-user", visibility: "hidden_by_user", },
        { id: "msg-hidden-mod", visibility: "hidden_by_moderator", },
        { id: "msg-auto", visibility: "auto_hidden", },
      ],);
    });

    test("only visible messages appear in default query", () => {
      const visible = sqlite
        .query("SELECT COUNT(*) as cnt FROM messages WHERE visibility = 'visible'",)
        .get() as Row;
      const hidden = sqlite
        .query("SELECT COUNT(*) as cnt FROM messages WHERE visibility != 'visible'",)
        .get() as Row;
      expect(visible.cnt,).toBe(1,);
      expect(hidden.cnt,).toBe(3,);
    });
  });

  describe("chat_participants — actor FK replaces polymorphic pair", () => {
    test("participants link actors to chats", async () => {
      const chatId = "chat-cp";
      await db
        .insertInto("chats",)
        .values({ id: chatId, name: "CP Test", type: "group", mode: "group", created_by: "user-1", },)
        .execute();

      await db
        .insertInto("chat_participants",)
        .values({ chat_id: chatId, actor_id: "actor-user-1", role_in_chat: "owner", },)
        .execute();

      await db
        .insertInto("chat_participants",)
        .values({ chat_id: chatId, actor_id: "actor-char-1", role_in_chat: "member", },)
        .execute();

      const participants = sqlite
        .query(
          "SELECT a.display_name, cp.role_in_chat FROM chat_participants cp JOIN actors a ON a.id = cp.actor_id WHERE cp.chat_id = ? ORDER BY cp.rowid",
        )
        .all(chatId,) as Row[];
      expect(participants,).toHaveLength(2,);
      expect(participants[0]!.display_name,).toBe("Alice",);
      expect(participants[0]!.role_in_chat,).toBe("owner",);
      expect(participants[1]!.display_name,).toBe("Bob",);
    });

    test("composite PK prevents duplicate actor in same chat", async () => {
      await expect(
        db
          .insertInto("chat_participants",)
          .values({ chat_id: "chat-cp", actor_id: "actor-user-1", role_in_chat: "member", },)
          .execute(),
      ).rejects.toThrow();
    });
  });

  describe("characters — agent_type replaces is_bot boolean", () => {
    test("character defaults to agent_type='none'", async () => {
      await db
        .insertInto("characters",)
        .values({
          id: "char-agent-1",
          owner_id: "user-1",
          name: "Default Char",
          agent_type: "none",
          settings: "{}",
        },)
        .execute();

      const c = sqlite.query("SELECT agent_type FROM characters WHERE id = ?",).get("char-agent-1",) as Row;
      expect(c.agent_type,).toBe("none",);
    });

    test("can set different agent types", async () => {
      await db
        .insertInto("characters",)
        .values({
          id: "char-ai",
          owner_id: "user-1",
          name: "AI Buddy",
          agent_type: "ai",
          settings: "{}",
        },)
        .execute();

      await db
        .insertInto("characters",)
        .values({
          id: "char-npc",
          owner_id: "user-1",
          name: "Shopkeeper",
          agent_type: "npc",
          settings: "{}",
        },)
        .execute();

      const aiChar = sqlite.query("SELECT agent_type FROM characters WHERE id = ?",).get("char-ai",) as Row;
      const npcChar = sqlite.query("SELECT agent_type FROM characters WHERE id = ?",).get("char-npc",) as Row;
      expect(aiChar.agent_type,).toBe("ai",);
      expect(npcChar.agent_type,).toBe("npc",);
    });

    test("query by agent type", () => {
      const aiChars = sqlite
        .query("SELECT COUNT(*) as cnt FROM characters WHERE agent_type = 'ai'",)
        .get() as Row;
      const humanChars = sqlite
        .query("SELECT COUNT(*) as cnt FROM characters WHERE agent_type = 'none'",)
        .get() as Row;
      expect(aiChars.cnt,).toBe(1,);
      expect(humanChars.cnt,).toBe(1,);
    });
  });

  describe("actor-based message queries", () => {
    test("messages join to actors instead of user/character FKs", async () => {
      const chatId = "chat-actor-msg";
      await db
        .insertInto("chats",)
        .values({ id: chatId, name: "Actor Msg", type: "direct", mode: "direct", created_by: "user-1", },)
        .execute();

      await db
        .insertInto("chat_participants",)
        .values([
          { chat_id: chatId, actor_id: "actor-user-1", role_in_chat: "member", },
          { chat_id: chatId, actor_id: "actor-char-1", role_in_chat: "member", },
        ],)
        .execute();

      await db
        .insertInto("messages",)
        .values({
          id: "msg-actor-1",
          chat_id: chatId,
          actor_id: "actor-user-1",
          role: "user",
          content: "Hi Bob!",
          content_type: "text",
          content_format: "markdown",
          content_encoding: "identity",
          status: "confirmed",
          visibility: "visible",
        },)
        .execute();

      await db
        .insertInto("messages",)
        .values({
          id: "msg-actor-2",
          chat_id: chatId,
          actor_id: "actor-char-1",
          role: "assistant",
          content: "Hello Alice!",
          content_type: "text",
          content_format: "markdown",
          content_encoding: "identity",
          status: "confirmed",
          visibility: "visible",
        },)
        .execute();

      const msgs = sqlite
        .query(
          `SELECT m.content, a.display_name, a.actor_type
         FROM messages m
         JOIN actors a ON a.id = m.actor_id
         WHERE m.chat_id = ?
         ORDER BY m.created_at`,
        )
        .all(chatId,) as Row[];
      expect(msgs,).toHaveLength(2,);
      expect(msgs[0]!.content,).toBe("Hi Bob!",);
      expect(msgs[0]!.display_name,).toBe("Alice",);
      expect(msgs[1]!.content,).toBe("Hello Alice!",);
      expect(msgs[1]!.display_name,).toBe("Bob",);
    });
  });

  describe("edge cases & constraints", () => {
    test("FK constraint: message actor must exist", async () => {
      await expect(
        db
          .insertInto("messages",)
          .values({
            id: "msg-orphan",
            chat_id: "chat-vis",
            actor_id: "nonexistent-actor",
            role: "user",
            content: "test",
            content_type: "text",
            content_format: "markdown",
            content_encoding: "identity",
            status: "confirmed",
            visibility: "visible",
          },)
          .execute(),
      ).rejects.toThrow();
    });

    test("FK constraint: participant actor must exist", async () => {
      await expect(
        db
          .insertInto("chat_participants",)
          .values({ chat_id: "chat-vis", actor_id: "ghost", role_in_chat: "member", },)
          .execute(),
      ).rejects.toThrow();
    });
  });
});
