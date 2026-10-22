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
import { messagePollRoutes, } from "./message-polls";

const BASE = "http://localhost";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

/**
 * Auth-context app via derive, mirroring message-reactions.test.ts.
 * @param db
 * @param userId
 * @param userRole
 */
function pollApp(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-polls", },)
    .derive(() => ({ userId, userRole, }))
    .use(messagePollRoutes({ database: db, },),) as unknown as Elysia;
}

/**
 * @param path
 */
function get(path: string,): Request {
  return new Request(`${BASE}${path}`,);
}

/**
 * @param path
 * @param body
 */
function post(path: string, body?: unknown,): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: body === undefined ? undefined : JSON.stringify(body,),
  },);
}

describe("messagePollRoutes access checks", () => {
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
        row_version: 0,
      } as never,);
    }

    await insertChats(db, "Poll Chat", ownerId, {},);
    chatId = (await db.selectFrom("chats",).select("id",).where("created_by", "=", ownerId,).executeTakeFirst())!.id;
    await insertChatParticipants(db, chatId, participantId, {},);

    await insertMessages(db, chatId, ownerId, MessageRole.User, "hello", {},);
    messageId = (await db.selectFrom("messages",).select("id",).where("chat_id", "=", chatId,).executeTakeFirst())!.id;
  },);

  afterAll(async () => {
    await sqlite.close();
  },);

  test("returns 401 without userId (create/vote/close)", async () => {
    const app = pollApp(db, null, null,);
    expect((await app.handle(get(`/api/messages/${messageId}/poll`,),)).status,).toBe(401,);
    expect(
      (await app.handle(
        post(`/api/messages/${messageId}/poll`, { question: "?", options: ["a", "b",], multi: false, },),
      )).status,
    ).toBe(401,);

    expect((await app.handle(post(`/api/messages/${messageId}/poll/vote`, { optionIdx: 0, },),)).status,).toBe(401,);
    expect((await app.handle(post(`/api/messages/${messageId}/poll/close`,),)).status,).toBe(401,);
  });

  test("404 for a missing message (outsider never learns it exists)", async () => {
    const app = pollApp(db, outsiderId, null,);
    const missing = uid();
    expect((await app.handle(get(`/api/messages/${missing}/poll`,),)).status,).toBe(404,);
    expect(
      (await app.handle(
        post(`/api/messages/${missing}/poll`, { question: "?", options: ["a", "b",], multi: false, },),
      )).status,
    ).toBe(404,);
  });

  test("participant round-trip: create, vote, list, close (409 after)", async () => {
    const app = pollApp(db, participantId, null,);

    const created = await app.handle(
      post(`/api/messages/${messageId}/poll`, { question: "Push?", options: ["Yes", "No",], multi: false, },),
    );

    expect(created.status,).toBe(200,);
    const poll = (await created.json()) as { id: string; closed: boolean; tallies: unknown[] };
    expect(poll.closed,).toBe(false,);

    const voted = await app.handle(post(`/api/messages/${messageId}/poll/vote`, { optionIdx: 0, },),);
    expect(voted.status,).toBe(200,);

    const listed = await app.handle(get(`/api/chats/${chatId}/polls`,),);
    expect(listed.status,).toBe(200,);
    const polls = (await listed.json()) as { messageId: string; viewerOptionIdxs: number[] }[];
    expect(polls,).toHaveLength(1,);
    expect(polls[0]?.viewerOptionIdxs,).toEqual([0,],);

    const closed = await app.handle(post(`/api/messages/${messageId}/poll/close`,),);
    expect(closed.status,).toBe(200,);

    const rejected = await app.handle(post(`/api/messages/${messageId}/poll/vote`, { optionIdx: 1, },),);
    expect(rejected.status,).toBe(409,);
  });

  test("non-creator participant close is 403; invalid option index is 400", async () => {
    const creator = pollApp(db, ownerId, null,);
    expect(
      (await creator.handle(
        post(`/api/messages/${messageId}/poll`, { question: "Again?", options: ["a", "b",], multi: false, },),
      )).status,
    ).toBe(409,);

    // The previous test closed the shared poll; create a fresh message.
    const secondId = await insertMessages(db, chatId, ownerId, MessageRole.User, "poll me", {},);
    await creator.handle(
      post(`/api/messages/${secondId}/poll`, { question: "Again?", options: ["a", "b",], multi: false, },),
    );

    const voter = pollApp(db, participantId, null,);
    expect((await voter.handle(post(`/api/messages/${secondId}/poll/close`,),)).status,).toBe(403,);
    expect((await voter.handle(post(`/api/messages/${secondId}/poll/vote`, { optionIdx: 99, },),)).status,).toBe(400,);
  });
});
