import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { MessageRole, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { messageReactionsRoutes, } from "./message-reactions";

const BASE = "http://localhost";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

/** Auth-context app via derive, mirroring chat-sections/chats test helpers. */
function reactionApp(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-reactions", },)
    .derive(() => ({ userId, userRole, }))
    .use(messageReactionsRoutes({ database: db, },),) as unknown as Elysia;
}

function get(path: string,): Request {
  return new Request(`${BASE}${path}`,);
}

function toggle(path: string, emoji: string,): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: JSON.stringify({ emoji, },),
  },);
}

function del(path: string,): Request {
  return new Request(`${BASE}${path}`, { method: "DELETE", },);
}

describe("messageReactionsRoutes access checks", () => {
  let db: Kysely<DB>;
  let sqlite: TestDb["sqlite"];
  let ownerId: string;
  let participantId: string;
  let outsiderId: string;
  let chatId: string;
  let messageId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, sqlite, } = await createTestDb());

    ownerId = uid();
    participantId = uid();
    outsiderId = uid();

    await insertUsers(db, "owner", "Owner", { id: ownerId, } as never,);
    await insertUsers(db, "participant", "Participant", { id: participantId, } as never,);
    await insertUsers(db, "outsider", "Outsider", { id: outsiderId, } as never,);

    // Each user id doubles as an actor id (chat_participants.actor_id → actors.id).
    for (const id of [ownerId, participantId, outsiderId,]) {
      await insertActors(db, id, {
        id,
        actor_type: "user",
        user_id: id,
        owner_id: id,
        agent_type: "none",
        settings: "{}",
        format_version: 0,
      } as never,);
    }

    await insertChats(db, "Reaction Chat", ownerId, {},);
    chatId = (await db.selectFrom("chats",).select("id",).where("created_by", "=", ownerId,).executeTakeFirst())!.id;

    // Owner is creator (granted via created_by); add the participant.
    await insertChatParticipants(db, chatId, participantId, {},);

    await insertMessages(db, chatId, ownerId, MessageRole.User, "hello", {},);
    messageId = (await db.selectFrom("messages",).select("id",).where("chat_id", "=", chatId,).executeTakeFirst())!.id;
  },);

  afterAll(async () => {
    await sqlite.close();
  },);

  test("returns 401 without userId (GET/POST/DELETE)", async () => {
    const app = reactionApp(db, null, null,);
    expect((await app.handle(get(`/api/messages/${messageId}/reactions`,),)).status,).toBe(401,);
    expect((await app.handle(toggle(`/api/messages/${messageId}/reactions`, "👍",),)).status,).toBe(401,);
    expect((await app.handle(del(`/api/messages/${messageId}/reactions`,),)).status,).toBe(401,);
  });

  test("404 when the message does not exist", async () => {
    const app = reactionApp(db, ownerId, null,);
    const missing = uid();
    expect((await app.handle(get(`/api/messages/${missing}/reactions`,),)).status,).toBe(404,);
    expect((await app.handle(toggle(`/api/messages/${missing}/reactions`, "👍",),)).status,).toBe(404,);
    expect((await app.handle(del(`/api/messages/${missing}/reactions`,),)).status,).toBe(404,);
  });

  test("chat owner can GET, POST, DELETE reactions", async () => {
    // non-privileged role (null) — passes purely via chat ownership
    const app = reactionApp(db, ownerId, null,);

    const created = await app.handle(toggle(`/api/messages/${messageId}/reactions`, "🔥",),);
    expect(created.status,).toBe(200,);

    const listed = await app.handle(get(`/api/messages/${messageId}/reactions`,),);
    expect(listed.status,).toBe(200,);

    const removed = await app.handle(del(`/api/messages/${messageId}/reactions`,),);
    expect(removed.status,).toBe(200,);
  });

  test("chat participant can GET, POST, DELETE reactions", async () => {
    // non-privileged role (null) — passes purely via chat_participants
    const app = reactionApp(db, participantId, null,);

    const created = await app.handle(toggle(`/api/messages/${messageId}/reactions`, "❤️",),);
    expect(created.status,).toBe(200,);

    const listed = await app.handle(get(`/api/messages/${messageId}/reactions`,),);
    expect(listed.status,).toBe(200,);

    const removed = await app.handle(del(`/api/messages/${messageId}/reactions`,),);
    expect(removed.status,).toBe(200,);
  });

  test("non-participant outsider gets 404 (GET/POST/DELETE)", async () => {
    const app = reactionApp(db, outsiderId, null,);
    expect((await app.handle(get(`/api/messages/${messageId}/reactions`,),)).status,).toBe(404,);
    expect((await app.handle(toggle(`/api/messages/${messageId}/reactions`, "👍",),)).status,).toBe(404,);
    expect((await app.handle(del(`/api/messages/${messageId}/reactions`,),)).status,).toBe(404,);
  });

  test("admin role passes access check even for non-participant", async () => {
    const app = reactionApp(db, outsiderId, "admin",);
    expect((await app.handle(get(`/api/messages/${messageId}/reactions`,),)).status,).toBe(200,);
  });

  test("toggle adds then removes a reaction", async () => {
    const app = reactionApp(db, ownerId, null,);

    const add = await app.handle(toggle(`/api/messages/${messageId}/reactions`, "✨",),);
    const firstToggleBody = (await add.json()) as { toggled: boolean; emoji: string };
    expect(firstToggleBody,).toEqual({ toggled: true, emoji: "✨", },);

    const remove = await app.handle(toggle(`/api/messages/${messageId}/reactions`, "✨",),);
    const secondToggleBody = (await remove.json()) as { toggled: boolean; emoji: string };
    expect(secondToggleBody,).toEqual({ toggled: false, emoji: "✨", },);
  });

  test("POST rejects an empty emoji", async () => {
    const app = reactionApp(db, ownerId, null,);
    // Empty string passes the t.String() schema but fails the handler's runtime guard → 400.
    const res = await app.handle(
      new Request(`${BASE}/api/messages/${messageId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ emoji: "", },),
      },),
    );
    expect(res.status,).toBe(400,);
  });
});
