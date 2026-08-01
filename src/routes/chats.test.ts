/**
 * Tests for chats routes — CRUD + batch operations
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { MessageStatus, } from "../db/enums";
import { QuestType, } from "../db/enums-story";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertChatSetupTemplates,
  insertGroupInitiatives,
  insertMessages,
  insertQuestProgress,
  insertQuests,
  insertWorlds,
} from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { chatsRoutes, } from "./chats";

function createApp(db: Kysely<DB>, userId: string | null,): Elysia {
  return new Elysia({ name: "test-chats", },)
    .derive(() => ({ userId, }))
    .use(chatsRoutes({ database: db, config: {} as any, },),) as unknown as Elysia;
}

describe("chatsRoutes", () => {
  let db: Kysely<DB>;
  const userId = uid();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    await db
      .insertInto("users",)
      .values({
        id: userId,
        username: `user-${userId}`,
        display_name: "Test User",
        role: "solo",
        status: "active",
        settings: "{}",
      },)
      .execute();

    // Chat creation inserts userId as actor_id in chat_participants (FK → actors.id)
    await db
      .insertInto("actors",)
      .values({
        id: userId,
        actor_type: "user",
        display_name: "Test User",
        user_id: userId,
        owner_id: userId,
        agent_type: "none",
        settings: "{}",
        format_version: 0,
        visibility: "private",
        import_spec: "{}",
      },)
      .execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  // ── Auth ─────────────────────────────────────────────────────

  test("GET /api/chats returns 401 without userId", async () => {
    const app = createApp(db, null,);
    const res = await app.handle(new Request("http://localhost/api/chats",),);
    expect(res.status,).toBe(401,);
  });

  test("POST /api/chats returns 401 without userId", async () => {
    const app = createApp(db, null,);
    const res = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Test", },),
      },),
    );
    expect(res.status,).toBe(401,);
  });

  // ── GET /api/chats ───────────────────────────────────────────

  test("GET /api/chats returns empty list", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/chats",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: unknown[]; pagination: { total: number } };
    expect(body.data,).toBeInstanceOf(Array,);
    expect(body.pagination.total,).toBe(0,);
  });

  // ── POST /api/chats ──────────────────────────────────────────

  test("POST /api/chats creates a chat", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "My Chat", },),
      },),
    );
    expect(res.status,).toBe(201,);
    const body = (await res.json()) as { id: string };
    expect(body.id,).toBeDefined();

    // Verify chat exists in DB
    const chat = await db.selectFrom("chats",).selectAll().where("id", "=", body.id,).executeTakeFirst();
    expect(chat,).toBeDefined();
    expect(chat?.name,).toBe("My Chat",);
    expect(chat?.created_by,).toBe(userId,);
  });

  test("POST /api/chats with type and mode", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Group Chat", type: "group", mode: "group", },),
      },),
    );
    expect(res.status,).toBe(201,);
    const body = (await res.json()) as { id: string };
    const chat = await db.selectFrom("chats",).selectAll().where("id", "=", body.id,).executeTakeFirst();
    expect(chat?.type,).toBe("group",);
    expect(chat?.mode,).toBe("group",);
  });

  // ── GET /api/chats (after creating) ──────────────────────────

  test("GET /api/chats returns user's chats", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/chats",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: unknown[]; pagination: { total: number } };
    expect(body.pagination.total,).toBeGreaterThanOrEqual(2,);
    expect(body.data.every((c: any,) => c.created_by === userId),).toBe(true,);
  });

  // ── GET /api/chats/:id ───────────────────────────────────────

  test("GET /api/chats/:id returns specific chat", async () => {
    // Create a chat
    const app = createApp(db, userId,);
    const chatCreate = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Find Me", },),
      },),
    );
    const { id, } = (await chatCreate.json()) as { id: string };

    const res = await app.handle(new Request(`http://localhost/api/chats/${id}`,),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { name: string };
    expect(body.name,).toBe("Find Me",);
  });

  test("GET /api/chats/:id returns 404 for nonexistent", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(new Request(`http://localhost/api/chats/${uid()}`,),);
    expect(res.status,).toBe(404,);
  });

  // ── PUT /api/chats/:id ───────────────────────────────────────

  test("PUT /api/chats/:id updates a chat", async () => {
    const app = createApp(db, userId,);
    const chatCreate = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Old Name", },),
      },),
    );
    const { id, } = (await chatCreate.json()) as { id: string };

    const res = await app.handle(
      new Request(`http://localhost/api/chats/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "New Name", },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok,).toBe(true,);

    // Verify update persisted
    const chat = await db.selectFrom("chats",).selectAll().where("id", "=", id,).executeTakeFirst();
    expect(chat?.name,).toBe("New Name",);
  });

  // ── POST /api/chats/:id/rename ───────────────────────────────

  test("POST /api/chats/:id/rename updates chat name", async () => {
    const app = createApp(db, userId,);
    const chatCreate = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Original Name", },),
      },),
    );
    const { id, } = (await chatCreate.json()) as { id: string };

    const res = await app.handle(
      new Request(`http://localhost/api/chats/${id}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Renamed Chat", name_source: "manual", },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok,).toBe(true,);

    // Verify rename persisted
    const chat = await db.selectFrom("chats",).selectAll().where("id", "=", id,).executeTakeFirst();
    expect(chat?.name,).toBe("Renamed Chat",);
    expect(chat?.name_source,).toBe("manual",);
  });

  test("POST /api/chats/:id/rename rejects invalid name length", async () => {
    const app = createApp(db, userId,);
    const chatCreate = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Test", },),
      },),
    );
    const { id, } = (await chatCreate.json()) as { id: string };
    const longName = "A".repeat(61,);
    const renameBody = JSON.stringify({ name: longName, name_source: "manual", },);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${id}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: renameBody,
      },),
    );
    expect(res.status,).toBe(400,);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.error,).toContain("1-60 characters",);
  });

  test("POST /api/chats/:id/rename rejects duplicate name", async () => {
    const app = createApp(db, userId,);

    // Create first chat
    const chat1Create = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Chat One", },),
      },),
    );
    const { id: id1, } = (await chat1Create.json()) as { id: string };

    // Create second chat
    const chat2Create = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Chat Two", },),
      },),
    );
    const { id: id2, } = (await chat2Create.json()) as { id: string };

    // Rename first chat to "Chat One"
    await app.handle(
      new Request(`http://localhost/api/chats/${id1}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Chat One", name_source: "manual", },),
      },),
    );

    // Try to rename second chat to same name
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${id2}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Chat One", name_source: "manual", },),
      },),
    );
    expect(res.status,).toBe(400,);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.error,).toContain("already in use",);
  });

  // ── DELETE /api/chats/:id ────────────────────────────────────

  test("DELETE /api/chats/:id removes a chat", async () => {
    const app = createApp(db, userId,);
    const chatCreate = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Delete Me", },),
      },),
    );
    const { id, } = (await chatCreate.json()) as { id: string };

    const res = await app.handle(new Request(`http://localhost/api/chats/${id}`, { method: "DELETE", },),);
    expect(res.status,).toBe(204,);

    const chatGet = await app.handle(new Request(`http://localhost/api/chats/${id}`,),);
    expect(chatGet.status,).toBe(404,);
  });

  // ── Ownership ────────────────────────────────────────────────

  test("user can't access another user's chats", async () => {
    const app = createApp(db, userId,);
    const chatCreate = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Owner Chat", },),
      },),
    );
    const { id, } = (await chatCreate.json()) as { id: string };

    const otherApp = createApp(db, "other-user-id",);
    const res = await otherApp.handle(new Request(`http://localhost/api/chats/${id}`,),);
    expect(res.status,).toBe(404,);
  });

  // ── Chat Setup Templates ─────────────────────────────────────

  test("GET /api/chat-setup-templates lists templates", async () => {
    await insertChatSetupTemplates(db, "advanced-roleplay", "Advanced Roleplay", {
      mode: "story",
      turn_strategy: "scene_based",
    },);

    const app = createApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/chat-setup-templates",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as Array<{ slug: string; mode: string | null }>;
    expect(body.some((t,) => t.slug === "advanced-roleplay",),).toBe(true,);
  });

  test("POST /api/chats seeds key mechanics from templateId", async () => {
    await insertChatSetupTemplates(db, "vn-story", "VN Story", {
      mode: "story",
      turn_strategy: "scene_based",
      visual_novel: 1,
    } as any,);

    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Template Chat", templateId: "vn-story", },),
      },),
    );
    expect(res.status,).toBe(201,);
    const { id, } = (await res.json()) as { id: string };
    const chat = await db.selectFrom("chats",).selectAll().where("id", "=", id,).executeTakeFirst();
    expect(chat?.mode,).toBe("story",);
    expect(chat?.turn_strategy,).toBe("scene_based",);
    expect(chat?.visual_novel,).toBe(1,);
    const tmpl = await db.selectFrom("chat_setup_templates",).select("id",).where("slug", "=", "vn-story",).executeTakeFirst();
    expect(chat?.template_id,).toBe(tmpl?.id,);
  });

  test("POST /api/chats with templateId and explicit override wins", async () => {
    await insertChatSetupTemplates(db, "tmpl-override", "Override", {
      mode: "story",
      turn_strategy: "scene_based",
    },);

    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Override Chat", templateId: "tmpl-override", mode: "direct", },),
      },),
    );
    expect(res.status,).toBe(201,);
    const { id, } = (await res.json()) as { id: string };
    const chat = await db.selectFrom("chats",).selectAll().where("id", "=", id,).executeTakeFirst();
    expect(chat?.mode,).toBe("direct",);
    expect(chat?.turn_strategy,).toBe("scene_based",);
  });

  test("POST /api/chats with unknown templateId returns 404", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Bad Template", templateId: "does-not-exist", },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  // ── Online guard (key mechanics immutable when online) ───────

  test("draft chat allows key-mechanic mutation", async () => {
    const app = createApp(db, userId,);
    const chatCreate = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Draft", mode: "direct", },),
      },),
    );
    const { id, } = (await chatCreate.json()) as { id: string };

    const res = await app.handle(
      new Request(`http://localhost/api/chats/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ mode: "story", },),
      },),
    );
    expect(res.status,).toBe(200,);
    const chat = await db.selectFrom("chats",).selectAll().where("id", "=", id,).executeTakeFirst();
    expect(chat?.mode,).toBe("story",);
  });

  test("online chat rejects key-mechanic mutation with 409", async () => {
    const app = createApp(db, userId,);
    const chatCreate = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Online", mode: "direct", },),
      },),
    );
    const { id, } = (await chatCreate.json()) as { id: string };

    // Make it online with a confirmed message
    await insertMessages(db, id, userId, "user", "hello", { status: MessageStatus.Confirmed, } as any,);

    const res = await app.handle(
      new Request(`http://localhost/api/chats/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ mode: "story", },),
      },),
    );
    expect(res.status,).toBe(409,);
    const body = (await res.json()) as { code: string };
    expect(body.code,).toBe("key_mechanic_conflict",);
  });

  test("online chat still allows session-state mutation", async () => {
    const app = createApp(db, userId,);
    const chatCreate = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Online State", mode: "direct", },),
      },),
    );
    const { id, } = (await chatCreate.json()) as { id: string };
    await insertMessages(db, id, userId, "user", "hello", { status: MessageStatus.Confirmed, } as any,);

    const res = await app.handle(
      new Request(`http://localhost/api/chats/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Renamed Online", isPinned: true, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const chat = await db.selectFrom("chats",).selectAll().where("id", "=", id,).executeTakeFirst();
    expect(chat?.name,).toBe("Renamed Online",);
  });

  // ── Migration ────────────────────────────────────────────────

  test("POST /api/chats/:id/migrate creates a new chat bound to new template", async () => {
    await insertChatSetupTemplates(db, "migrate-target", "Migrate Target", {
      mode: "story",
      turn_strategy: "scene_based",
      visual_novel: 1,
    } as any,);
    const app = createApp(db, userId,);
    const chatCreate = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Source Chat", mode: "direct", },),
      },),
    );
    const { id: sourceId, } = (await chatCreate.json()) as { id: string };

    const res = await app.handle(
      new Request(`http://localhost/api/chats/${sourceId}/migrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          templateId: "migrate-target",
          name: "Migrated Chat",
          carry: { history: "full", },
        },),
      },),
    );
    expect(res.status,).toBe(201,);
    const body = (await res.json()) as { newChatId: string; sourceChatId: string };
    expect(body.sourceChatId,).toBe(sourceId,);

    const newChat = await db.selectFrom("chats",).selectAll().where("id", "=", body.newChatId,).executeTakeFirst();
    expect(newChat?.parent_chat_id,).toBe(sourceId,);
    expect(newChat?.mode,).toBe("story",);
    const tmpl = await db.selectFrom("chat_setup_templates",).select("id",).where("slug", "=", "migrate-target",).executeTakeFirst();
    expect(newChat?.template_id,).toBe(tmpl?.id,);
  });

  test("POST /api/chats/:id/migrate is idempotent (rejects second migrate)", async () => {
    const app = createApp(db, userId,);
    const chatCreate = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Source Again", },),
      },),
    );
    const { id: sourceId, } = (await chatCreate.json()) as { id: string };

    await app.handle(
      new Request(`http://localhost/api/chats/${sourceId}/migrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ templateId: "migrate-target", },),
      },),
    );

    const second = await app.handle(
      new Request(`http://localhost/api/chats/${sourceId}/migrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ templateId: "migrate-target", },),
      },),
    );
    expect(second.status,).toBe(400,);
  });

  test("POST /api/chats/:id/migrate rejects unknown template", async () => {
    const app = createApp(db, userId,);
    const chatCreate = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Source Three", },),
      },),
    );
    const { id: sourceId, } = (await chatCreate.json()) as { id: string };

    const res = await app.handle(
      new Request(`http://localhost/api/chats/${sourceId}/migrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ templateId: "nope", },),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("POST /api/chats/:id/migrate carries party/game state (turns, quests, initiatives, pins, VN choices)", async () => {
    await insertChatSetupTemplates(db, "state-target", "State Target", {
      mode: "story",
      turn_strategy: "scene_based",
    },);
    const app = createApp(db, userId,);
    const chatCreate = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "State Source", mode: "story", },),
      },),
    );
    const { id: sourceId, } = (await chatCreate.json()) as { id: string };

    // Seed chat-bound party state
    await insertGroupInitiatives(db, sourceId, "scene-1", userId,);
    const msgId = uid();
    await insertMessages(db, sourceId, userId, "user", "hello", { id: msgId, status: MessageStatus.Confirmed, } as any,);
    const worldId = uid();
    await insertWorlds(db, userId, "Quest World", { id: worldId, } as any,);
    const questId = uid();
    await insertQuests(db, worldId, userId, "Slay the Dragon", QuestType.Destruction, 1, { id: questId, } as any,);
    await insertQuestProgress(db, questId, sourceId,);
    await db.insertInto("story_turns",).values({
      id: uid(),
      chat_id: sourceId,
      turn_number: 1,
      actor_id: userId,
      turn_type: "narration",
      prompt_sent: "p",
      status: "accepted",
      regeneration_count: 0,
      world_events: "[]",
      quest_progress: "{}",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },).execute();
    await db.insertInto("chat_pins",).values({
      id: uid(),
      chat_id: sourceId,
      message_id: msgId,
      pinned_by: userId,
      pinned_at: new Date().toISOString(),
    },).execute();
    await db.insertInto("vn_choices",).values({
      id: uid(),
      chat_id: sourceId,
      scene_index: 0,
      label: "Choice",
      consequences: "[]",
      relationship_impact: "[]",
      mood_impact: "[]",
      unlock_conditions: "[]",
      selected: 0,
      created_at: new Date().toISOString(),
    },).execute();

    const res = await app.handle(
      new Request(`http://localhost/api/chats/${sourceId}/migrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          templateId: "state-target",
          carry: { state: true, pins: true, },
        },),
      },),
    );
    expect(res.status,).toBe(201,);
    const { newChatId, } = (await res.json()) as { newChatId: string };

    const turnCount = await db.selectFrom("story_turns",).select(db.fn.countAll<number>().as("n",),).where("chat_id", "=", newChatId,).executeTakeFirst();
    expect(turnCount?.n,).toBe(1,);
    const questCount = await db.selectFrom("quest_progress",).select(db.fn.countAll<number>().as("n",),).where("chat_id", "=", newChatId,).executeTakeFirst();
    expect(questCount?.n,).toBe(1,);
    const initCount = await db.selectFrom("group_initiatives",).select(db.fn.countAll<number>().as("n",),).where("chat_id", "=", newChatId,).executeTakeFirst();
    expect(initCount?.n,).toBe(1,);
    const pinCount = await db.selectFrom("chat_pins",).select(db.fn.countAll<number>().as("n",),).where("chat_id", "=", newChatId,).executeTakeFirst();
    expect(pinCount?.n,).toBe(1,);
    const choiceCount = await db.selectFrom("vn_choices",).select(db.fn.countAll<number>().as("n",),).where("chat_id", "=", newChatId,).executeTakeFirst();
    expect(choiceCount?.n,).toBe(1,);
  });

  test("POST /api/chats/:id/migrate does not carry party state when carry.state omitted", async () => {
    await insertChatSetupTemplates(db, "nostate-target", "NoState Target", {
      mode: "story",
    },);
    const app = createApp(db, userId,);
    const chatCreate = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "NoState Source", mode: "story", },),
      },),
    );
    const { id: sourceId, } = (await chatCreate.json()) as { id: string };
    await db.insertInto("story_turns",).values({
      id: uid(),
      chat_id: sourceId,
      turn_number: 1,
      actor_id: userId,
      turn_type: "narration",
      prompt_sent: "p",
      status: "accepted",
      regeneration_count: 0,
      world_events: "[]",
      quest_progress: "{}",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },).execute();

    const res = await app.handle(
      new Request(`http://localhost/api/chats/${sourceId}/migrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ templateId: "nostate-target", },),
      },),
    );
    expect(res.status,).toBe(201,);
    const { newChatId, } = (await res.json()) as { newChatId: string };
    const turnCount = await db.selectFrom("story_turns",).select(db.fn.countAll<number>().as("n",),).where("chat_id", "=", newChatId,).executeTakeFirst();
    expect(turnCount?.n,).toBe(0,);
  });
});
