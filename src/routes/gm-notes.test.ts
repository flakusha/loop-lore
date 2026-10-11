/**
 * Unit tests for gm-notes routes (whitenotes + shadow notes CRUD).
 *
 * Covers auth (401), access control (403), create/list/reveal/delete,
 * and validation (400).
 */
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import {
  MessageRole,
  ShadowNoteType,
  ShadowNoteVisibility,
  WhiteneoteType,
} from "../db/enums";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertMessages,
  insertShadowNotes,
  insertUsers,
  insertWorlds,
} from "../test-utils/insert-helpers";
import { gmNotesRoutes, } from "./gm-notes";

const BASE = "http://localhost";

/** Full-schema test DB with a chat owned by owner-1. */
async function setup(): Promise<Kysely<DB>> {
  const { db, } = await createTestDb();
  await insertUsers(db, "owner", "Owner", { id: "owner-1", } as any,);
  await insertUsers(db, "other", "Other", { id: "other-1", } as any,);
  await insertWorlds(db, "owner-1", "Test World", { id: "world-1", } as any,);
  await insertChats(
    db,
    "GM Chat",
    "owner-1",
    { id: "11111111-1111-4111-8111-111111111111", world_id: "world-1", } as any,
  );

  return db;
}

/**
 * Bare app (no auth context) or with derived userId/userRole.
 * @param db
 * @param userId
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userId?: string, userRole?: string,) {
  const app = new Elysia();
  if (userId) {
    app.derive(() => ({ userId, userRole, }));
  }

  return app.use(gmNotesRoutes({ database: db, config: {} as any, },),);
}

/**
 * @param res
 */
function getJson<T,>(res: Response,): Promise<T> {
  return res.json() as Promise<T>;
}

describe("gmNotesRoutes", () => {
  test("requires auth for all endpoints", async () => {
    const db = await setup();
    const app = makeApp(db,);

    const paths = [
      ["GET", "/api/chats/11111111-1111-4111-8111-111111111111/whitenotes", undefined,],
      ["POST", "/api/chats/11111111-1111-4111-8111-111111111111/whitenotes", { type: "tone", content: "Eerie", },],
      ["GET", "/api/chats/11111111-1111-4111-8111-111111111111/shadow-notes", undefined,],
      ["POST", "/api/chats/11111111-1111-4111-8111-111111111111/shadow-notes", {
        type: "foreshadowing",
        content: "Secret",
      },],
      [
        "POST",
        "/api/chats/11111111-1111-4111-8111-111111111111/shadow-notes/00000000-0000-4000-8000-000000000000/reveal",
        undefined,
      ],
      [
        "DELETE",
        "/api/chats/11111111-1111-4111-8111-111111111111/shadow-notes/00000000-0000-4000-8000-000000000000",
        undefined,
      ],
    ] as const;

    for (const [method, path, body,] of paths) {
      const res = await app.handle(
        new Request(`${BASE}${path}`, {
          method,
          headers: body ? { "Content-Type": "application/json", } : undefined,
          body: body ? JSON.stringify(body,) : undefined,
        },),
      );

      expect(res.status, `expected 401 for ${method} ${path}`,).toBe(401,);
    }
  });

  test("non-member without admin role gets 403", async () => {
    const db = await setup();
    const app = makeApp(db, "other-1",);

    const res = await app.handle(
      new Request(`${BASE}/api/chats/11111111-1111-4111-8111-111111111111/whitenotes`,),
    );

    expect(res.status,).toBe(403,);
  });

  test("shadow note create → list → reveal → delete lifecycle", async () => {
    const db = await setup();
    const app = makeApp(db, "owner-1",);

    // Create
    const created = await app.handle(
      new Request(`${BASE}/api/chats/11111111-1111-4111-8111-111111111111/shadow-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ type: "world_secret", content: "The king is a lich.", },),
      },),
    );

    expect(created.status,).toBe(201,);
    const { id, } = await getJson<{ id: string }>(created,);
    expect(id,).toBeTruthy();

    // List
    const listed = await app.handle(
      new Request(`${BASE}/api/chats/11111111-1111-4111-8111-111111111111/shadow-notes`,),
    );

    expect(listed.status,).toBe(200,);
    const list = await getJson<{ items: { id: string; status: string; content: string }[]; total: number }>(listed,);
    expect(list.total,).toBe(1,);
    expect(list.items[0]!.content,).toBe("The king is a lich.",);
    expect(list.items[0]!.status,).toBe("hidden",);

    // Reveal
    const revealed = await app.handle(
      new Request(`${BASE}/api/chats/11111111-1111-4111-8111-111111111111/shadow-notes/${id}/reveal`, {
        method: "POST",
      },),
    );

    expect(revealed.status,).toBe(204,);

    const after = await getJson<{ items: { status: string }[] }>(
      await app.handle(
        new Request(`${BASE}/api/chats/11111111-1111-4111-8111-111111111111/shadow-notes`,),
      ),
    );

    expect(after.items[0]!.status,).toBe("revealed",);

    // Delete
    const del = await app.handle(
      new Request(`${BASE}/api/chats/11111111-1111-4111-8111-111111111111/shadow-notes/${id}`, { method: "DELETE", },),
    );

    expect(del.status,).toBe(204,);

    // Delete again → 404
    const delAgain = await app.handle(
      new Request(`${BASE}/api/chats/11111111-1111-4111-8111-111111111111/shadow-notes/${id}`, { method: "DELETE", },),
    );

    expect(delAgain.status,).toBe(404,);
  });

  test("whitenote create with priority + list ordering", async () => {
    const db = await setup();
    const app = makeApp(db, "owner-1",);

    for (
      const [priority, content,] of [
        [3, "Low priority.",],
        [8, "High priority.",],
      ] as const
    ) {
      const res = await app.handle(
        new Request(`${BASE}/api/chats/11111111-1111-4111-8111-111111111111/whitenotes`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ type: "tone", content, priority, scope: "scene", },),
        },),
      );

      expect(res.status,).toBe(201,);
    }

    const listed = await app.handle(
      new Request(`${BASE}/api/chats/11111111-1111-4111-8111-111111111111/whitenotes`,),
    );

    const list = await getJson<{ items: { priority: number; content: string }[] }>(listed,);
    expect(list.items[0]!.content,).toBe("High priority.",);
    expect(list.items[1]!.content,).toBe("Low priority.",);
  });

  test("rejects invalid body (empty content, bad type) with 422", async () => {
    const db = await setup();
    const app = makeApp(db, "owner-1",);

    const empty = await app.handle(
      new Request(`${BASE}/api/chats/11111111-1111-4111-8111-111111111111/whitenotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ type: "tone", content: "", },),
      },),
    );

    expect(empty.status,).toBe(422,);

    const badType = await app.handle(
      new Request(`${BASE}/api/chats/11111111-1111-4111-8111-111111111111/shadow-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ type: "not-a-type", content: "x", },),
      },),
    );

    expect(badType.status,).toBe(422,);
  });

  test("404 for unknown chat and unknown note id", async () => {
    const db = await setup();
    const app = makeApp(db, "owner-1",);

    const unknownChat = await app.handle(
      new Request(`${BASE}/api/chats/00000000-0000-4000-8000-000000000000/whitenotes`,),
    );

    expect(unknownChat.status,).toBe(403,); // checkChatAccess maps missing chat → forbidden

    const missing = await app.handle(
      new Request(
        `${BASE}/api/chats/11111111-1111-4111-8111-111111111111/whitenotes/00000000-0000-4000-8000-000000000000`,
        { method: "DELETE", },
      ),
    );

    expect(missing.status,).toBe(404,);
  });

  test("shadow note trigger_condition round-trips verbatim", async () => {
    const db = await setup();
    const app = makeApp(db, "owner-1",);
    const chatPath = `${BASE}/api/chats/11111111-1111-4111-8111-111111111111/shadow-notes`;

    const withTrigger = await app.handle(
      new Request(chatPath, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          type: "foreshadowing",
          content: "The well whispers at midnight.",
          triggerCondition: "when the player enters the crypt",
        },),
      },),
    );

    expect(withTrigger.status,).toBe(201,);

    const withoutTrigger = await app.handle(
      new Request(chatPath, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ type: "consequence", content: "Bare note.", },),
      },),
    );

    expect(withoutTrigger.status,).toBe(201,);

    const list = await getJson<{
      items: { content: string; trigger_condition: string | null }[];
    }>(await app.handle(new Request(chatPath,),),);

    const whispered = list.items.find((n,) => n.content === "The well whispers at midnight.")!;
    expect(whispered.trigger_condition,).toBe("when the player enters the crypt",);

    const bare = list.items.find((n,) => n.content === "Bare note.")!;
    expect(bare.trigger_condition,).toBeNull();
  });

  test("whitenote message_id scoping rejects dangling references", async () => {
    const db = await setup();
    await insertActors(
      db,
      "Narrator",
      { id: "narrator-1", actor_type: "narrator", agent_type: "narrator", } as never,
    );

    const messageId = await insertMessages(
      db,
      "11111111-1111-4111-8111-111111111111",
      "narrator-1",
      MessageRole.System,
      "The door creaks open.",
    );

    const app = makeApp(db, "owner-1",);
    const chatPath = `${BASE}/api/chats/11111111-1111-4111-8111-111111111111/whitenotes`;

    const anchored = await app.handle(
      new Request(chatPath, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          type: "tone",
          content: "Eerie near the door.",
          messageId,
        },),
      },),
    );

    expect(anchored.status,).toBe(201,);

    const dangling = await app.handle(
      new Request(chatPath, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          type: "tone",
          content: "Dangling anchor.",
          messageId: "00000000-0000-4000-8000-000000000009",
        },),
      },),
    );

    expect(dangling.status,).toBe(404,);

    // A real message from ANOTHER chat is not a valid anchor either.
    await insertChats(
      db,
      "Other Chat",
      "owner-1",
      { id: "22222222-2222-4222-8222-222222222222", world_id: "world-1", } as any,
    );

    const foreignMessageId = await insertMessages(
      db,
      "22222222-2222-4222-8222-222222222222",
      "narrator-1",
      MessageRole.System,
      "Belongs elsewhere.",
    );

    const foreign = await app.handle(
      new Request(chatPath, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          type: "tone",
          content: "Cross-chat anchor.",
          messageId: foreignMessageId,
        },),
      },),
    );

    expect(foreign.status,).toBe(404,);

    const list = await getJson<{
      items: { content: string; message_id: string | null }[];
    }>(await app.handle(new Request(chatPath,),),);

    const anchoredRow = list.items.find((n,) => n.content === "Eerie near the door.")!;
    expect(anchoredRow.message_id,).toBe(messageId,);

    const unscoped = list.items.find((n,) => n.content === "High priority.");
    expect(unscoped,).toBeUndefined();
  });

  test("whitenote without messageId stays chat-scoped (null)", async () => {
    const db = await setup();
    const app = makeApp(db, "owner-1",);

    const created = await app.handle(
      new Request(`${BASE}/api/chats/11111111-1111-4111-8111-111111111111/whitenotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ type: "tone", content: "Chat-scoped.", },),
      },),
    );

    expect(created.status,).toBe(201,);

    const list = await getJson<{ items: { message_id: string | null }[] }>(
      await app.handle(
        new Request(`${BASE}/api/chats/11111111-1111-4111-8111-111111111111/whitenotes`,),
      ),
    );

    expect(list.items[0]!.message_id,).toBeNull();
  });

  test("reveal appends revealed_to ids with dedupe (empty body tolerated)", async () => {
    const db = await setup();
    const app = makeApp(db, "owner-1",);
    const chatPath = `${BASE}/api/chats/11111111-1111-4111-8111-111111111111/shadow-notes`;

    const created = await app.handle(
      new Request(chatPath, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ type: "world_secret", content: "The king is a lich.", },),
      },),
    );

    const { id, } = await getJson<{ id: string }>(created,);

    const reveal = (revealedTo?: string[],): Request =>
      new Request(`${chatPath}/${id}/reveal`, {
        method: "POST",
        headers: revealedTo ? { "Content-Type": "application/json", } : undefined,
        body: revealedTo ? JSON.stringify({ revealedTo, },) : undefined,
      },);

    expect((await app.handle(reveal(),)).status,).toBe(204,);
    expect((await app.handle(reveal(["char-1", "char-2",],),)).status,).toBe(204,);
    expect((await app.handle(reveal(["char-2", "char-3",],),)).status,).toBe(204,);

    const list = await getJson<{
      items: { id: string; revealed_to: string[] | null }[];
    }>(await app.handle(new Request(chatPath,),),);

    const note = list.items.find((n,) => n.id === id)!;
    expect(note.revealed_to,).toEqual(["char-1", "char-2", "char-3",],);
  });

  test("gm_only reveal updates the row but emits NO narration message", async () => {
    const db = await setup();
    // Real narrator actor so any narration call would actually insert.
    await insertActors(
      db,
      "Narrator",
      { id: "narrator-1", actor_type: "narrator", agent_type: "narrator", } as never,
    );

    const noteId = await insertShadowNotes(
      db,
      "11111111-1111-4111-8111-111111111111",
      ShadowNoteType.WorldSecret,
      "GM-only: the king is a lich.",
      "2026-08-01T00:00:00Z",
      { visibility: ShadowNoteVisibility.Hidden, },
    );

    const app = makeApp(db, "owner-1",);
    const chatId = "11111111-1111-4111-8111-111111111111";

    const revealed = await app.handle(
      new Request(`${BASE}/api/chats/${chatId}/shadow-notes/${noteId}/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ revealedTo: ["char-1",], },),
      },),
    );

    expect(revealed.status,).toBe(204,);

    const row = await db
      .selectFrom("shadow_notes",)
      .select(["status", "visibility", "revealed_to",],)
      .where("id", "=", noteId,)
      .executeTakeFirst();

    expect(row?.status,).toBe("revealed",);
    // Invariant: revealed notes sit on the user-visible surface.
    expect(row?.visibility,).toBe("user_visible",);
    expect(JSON.parse(row?.revealed_to ?? "[]",),).toEqual(["char-1",],);

    // The leak: gm_only content must never reach the player-visible surface.
    const messages = await db
      .selectFrom("messages",)
      .select("id",)
      .where("chat_id", "=", chatId,)
      .execute();

    expect(messages,).toHaveLength(0,);
  });

  test("user_visible reveal emits a narration message", async () => {
    const db = await setup();
    await insertActors(
      db,
      "Narrator",
      { id: "narrator-1", actor_type: "narrator", agent_type: "narrator", } as never,
    );

    const app = makeApp(db, "owner-1",);
    const chatId = "11111111-1111-4111-8111-111111111111";
    const chatPath = `${BASE}/api/chats/${chatId}/shadow-notes`;

    const created = await app.handle(
      new Request(chatPath, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          type: "world_secret",
          content: "The well whispers at midnight.",
        },),
      },),
    );

    const { id, } = await getJson<{ id: string }>(created,);

    const revealed = await app.handle(new Request(`${chatPath}/${id}/reveal`, { method: "POST", },),);
    expect(revealed.status,).toBe(204,);

    const narration = await db
      .selectFrom("messages",)
      .selectAll()
      .where("chat_id", "=", chatId,)
      .execute();

    expect(narration,).toHaveLength(1,);
    expect(narration[0]!.content,).toContain("The well whispers at midnight.",);
  });

  test("enum values accepted for both note types", async () => {
    const db = await setup();
    const app = makeApp(db, "owner-1",);

    for (const type of Object.values(ShadowNoteType,)) {
      const res = await app.handle(
        new Request(`${BASE}/api/chats/11111111-1111-4111-8111-111111111111/shadow-notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ type, content: `note ${type}`, },),
        },),
      );

      expect(res.status,).toBe(201,);
    }

    for (const type of Object.values(WhiteneoteType,)) {
      const res = await app.handle(
        new Request(`${BASE}/api/chats/11111111-1111-4111-8111-111111111111/whitenotes`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ type, content: `note ${type}`, },),
        },),
      );

      expect(res.status,).toBe(201,);
    }
  });
});
