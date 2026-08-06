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
import { messageSearchRoutes, } from "./message-search";

const BASE = "http://localhost";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

/** Auth-context app via derive, mirroring message-reactions/chat-sections helpers. */
function searchApp(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-message-search", },)
    .derive(() => ({ userId, userRole, }))
    .use(messageSearchRoutes({ database: db, },),) as unknown as Elysia;
}

function get(path: string,): Request {
  return new Request(`${BASE}${path}`,);
}

async function appHandle(app: Elysia, req: Request,): Promise<Response> {
  return (app as unknown as { handle: (r: Request,) => Promise<Response> }).handle(req,);
}

interface SearchBody {
  results: {
    messageId: string;
    chatId: string;
    role: string;
    content: string;
    matchContext: string;
    matchScore: number;
    attachments?: { assetId: string }[];
  }[];
  total: number;
  hasMore: boolean;
  query: string;
}

describe("messageSearchRoutes", () => {
  let db: Kysely<DB>;
  let sqlite: TestDb["sqlite"];
  let ownerId: string;
  let participantId: string;
  let outsiderId: string;
  let chatId: string;
  let otherChatId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, sqlite, } = await createTestDb());

    ownerId = uid();
    participantId = uid();
    outsiderId = uid();

    await insertUsers(db, "owner", "Owner", { id: ownerId, } as never,);
    await insertUsers(db, "participant", "Participant", { id: participantId, } as never,);
    await insertUsers(db, "outsider", "Outsider", { id: outsiderId, } as never,);

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

    await insertChats(db, "Search Chat", ownerId, {},);
    chatId = (await db.selectFrom("chats",).select("id",).where("created_by", "=", ownerId,).executeTakeFirst())!.id;

    await insertChats(db, "Other Chat", outsiderId, {},);
    otherChatId =
      (await db.selectFrom("chats",).select("id",).where("name", "=", "Other Chat",).executeTakeFirst())!.id;

    await insertChatParticipants(db, chatId, participantId, {},);

    // Messages in the owner's chat.
    await insertMessages(db, chatId, ownerId, MessageRole.User, "The dragon guards the golden lair", {},);
    await insertMessages(db, chatId, participantId, MessageRole.Character, "I bring news of the dragon's lair", {},);
    await insertMessages(db, chatId, ownerId, MessageRole.Assistant, "A sack of coins spills onto the floor", {},);
    await insertMessages(db, otherChatId, outsiderId, MessageRole.User, "secret dragon treasure elsewhere", {},);
  },);

  afterAll(async () => {
    await sqlite.close();
  },);

  test("returns 401 without userId", async () => {
    const app = searchApp(db, null, null,);
    const res = await appHandle(app, get("/api/messages/search?q=dragon",),);
    expect(res.status,).toBe(401,);
  });

  test("searches within one chat with a match snippet", async () => {
    const app = searchApp(db, ownerId, "user",);
    const res = await appHandle(app, get(`/api/messages/search?chatId=${chatId}&q=dragon`,),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as SearchBody;
    expect(body.query,).toBe("dragon",);
    expect(body.total,).toBe(2,);
    expect(body.results,).toHaveLength(2,);
    // Every result carries a snippet that wraps the match in <mark>.</mark>
    for (const r of body.results) {
      expect(r.matchContext,).toContain("<mark>",);
      expect(r.matchContext,).toContain("</mark>",);
    }
  });

  test("chat participant can search; outsider gets 404 for that chat", async () => {
    const participantApp = searchApp(db, participantId, "user",);
    const ok = await appHandle(participantApp, get(`/api/messages/search?chatId=${chatId}&q=lair`,),);
    expect(ok.status,).toBe(200,);

    const outsiderApp = searchApp(db, outsiderId, "user",);
    const denied = await appHandle(outsiderApp, get(`/api/messages/search?chatId=${chatId}&q=dragon`,),);
    expect(denied.status,).toBe(404,);
  });

  test("role filter narrows results", async () => {
    const app = searchApp(db, ownerId, "user",);
    const res = await appHandle(app, get(`/api/messages/search?chatId=${chatId}&q=dragon&role=user`,),);
    const body = (await res.json()) as SearchBody;
    // Only the user-authored dragon message matches (character one is excluded).
    expect(body.results,).toHaveLength(1,);
    for (const r of body.results) {
      expect(r.role,).toBe("user",);
      expect(r.content,).toContain("The dragon",);
    }
  });

  test("hasAttachment filter returns only messages with attachments", async () => {
    await insertMessages(db, chatId, ownerId, MessageRole.User, "look at this image", {
      attachments: JSON.stringify([{ assetId: "asset_1", order: 0, caption: "pic", label: "", },],),
    },);
    const app = searchApp(db, ownerId, "user",);
    const res = await appHandle(
      app,
      get(`/api/messages/search?chatId=${chatId}&q=image&hasAttachment=true`,),
    );
    const body = (await res.json()) as SearchBody;
    expect(body.results,).toHaveLength(1,);
    expect(body.results[0]?.attachments,).toHaveLength(1,);
    expect(body.results[0]?.attachments?.[0]?.assetId,).toBe("asset_1",);
  });

  test("date range filter", async () => {
    const app = searchApp(db, ownerId, "user",);
    // Far-future range should match nothing.
    const none = await appHandle(
      app,
      get(`/api/messages/search?chatId=${chatId}&q=dragon&dateFrom=2099-01-01T00:00:00Z`,),
    );
    expect(((await none.json()) as SearchBody).total,).toBe(0,);
  });

  test("cross-chat search is scoped to the user's accessible chats", async () => {
    const app = searchApp(db, ownerId, "user",);
    // "secret dragon treasure elsewhere" lives in Other Chat (owner is not a participant).
    const res = await appHandle(app, get("/api/messages/search?q=dragon",),);
    const body = (await res.json()) as SearchBody;
    for (const r of body.results) {
      expect(r.chatId,).toBe(chatId,);
    }
    expect(body.results.some((r,) => r.content.includes("secret",)),).toBe(false,);
  });

  test("admin bypasses participant scoping", async () => {
    const app = searchApp(db, outsiderId, "admin",);
    const res = await appHandle(app, get("/api/messages/search?q=dragon",),);
    const body = (await res.json()) as SearchBody;
    // Admin sees both chats' dragon messages.
    const chatIds = new Set(body.results.map((r,) => r.chatId),);
    expect(chatIds.has(chatId,),).toBe(true,);
    expect(chatIds.has(otherChatId,),).toBe(true,);
  });

  test("pagination reports hasMore", async () => {
    const app = searchApp(db, ownerId, "user",);
    // 2 "dragon" messages exist in the chat; page by 1 → hasMore true, total 2.
    const res = await appHandle(app, get(`/api/messages/search?chatId=${chatId}&q=dragon&limit=1&offset=0`,),);
    const body = (await res.json()) as SearchBody;
    expect(body.results,).toHaveLength(1,);
    expect(body.hasMore,).toBe(true,);
    expect(body.total,).toBe(2,);
  });

  test("FTS stays in sync with message insert", async () => {
    await insertMessages(db, chatId, ownerId, MessageRole.User, "a shimmering unicorn appears", {},);
    const app = searchApp(db, ownerId, "user",);
    const res = await appHandle(app, get(`/api/messages/search?chatId=${chatId}&q=unicorn`,),);
    const body = (await res.json()) as SearchBody;
    expect(body.results.some((r,) => r.content.includes("unicorn",)),).toBe(true,);
  });

  test("FTS stays in sync with message delete", async () => {
    await insertMessages(db, chatId, ownerId, MessageRole.User, "unique snowflake mint", {},);
    const row = await db
      .selectFrom("messages",)
      .select("id",)
      .where("content", "=", "unique snowflake mint",)
      .executeTakeFirst();
    expect(row,).toBeTruthy();

    const app = searchApp(db, ownerId, "user",);
    const before =
      (await (await appHandle(app, get(`/api/messages/search?chatId=${chatId}&q=snowflake`,),)).json()) as SearchBody;
    expect(before.results.some((r,) => r.content.includes("mint",)),).toBe(true,);

    await db.deleteFrom("messages",).where("id", "=", row!.id,).execute();

    const after =
      (await (await appHandle(app, get(`/api/messages/search?chatId=${chatId}&q=snowflake`,),)).json()) as SearchBody;
    expect(after.results.some((r,) => r.content.includes("mint",)),).toBe(false,);
  });
});
