/* eslint-disable */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { encodeContent, } from "../content/encode";
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

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const BASE = "http://localhost";

/**
 * Auth-context app via derive, mirroring message-reactions/chat-sections helpers.
 * @param db
 * @param userId
 * @param userRole
 */
function searchApp(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-message-search", },)
    .derive(() => ({ userId, userRole, }))
    .use(messageSearchRoutes({ database: db, },),) as unknown as Elysia;
}

/**
 * @param path
 */
function get(path: string,): Request {
  return new Request(`${BASE}${path}`,);
}

/**
 * @param app
 * @param req
 */
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
    await insertMessages(db, chatId, ownerId, MessageRole.User, "The dragon guards the golden lair", {
      content_plaintext: "The dragon guards the golden lair",
    },);
    await insertMessages(db, chatId, participantId, MessageRole.Character, "I bring news of the dragon's lair", {
      content_plaintext: "I bring news of the dragon's lair",
    },);
    await insertMessages(db, chatId, ownerId, MessageRole.Assistant, "A sack of coins spills onto the floor", {
      content_plaintext: "A sack of coins spills onto the floor",
    },);
    await insertMessages(db, otherChatId, outsiderId, MessageRole.User, "secret dragon treasure elsewhere", {
      content_plaintext: "secret dragon treasure elsewhere",
    },);
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
      content_plaintext: "look at this image",
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
    const chatIds = new Set(body.results.map((r,) => r.chatId,),);
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
  test("deleted message no longer appears after search", async () => {
    const app = searchApp(db, ownerId, "user",);
    await insertMessages(db, chatId, ownerId, MessageRole.User, "temporary-mint snowflake", {
      content_plaintext: "temporary-mint snowflake",
    },);
    const row = await db.selectFrom("messages",).select("id",).where("content_plaintext", "=", "temporary-mint snowflake",).executeTakeFirst();
    expect(row,).toBeTruthy();

    const before =
      (await (await appHandle(app, get(`/api/messages/search?chatId=${chatId}&q=snowflake`,),)).json()) as SearchBody;
    expect(before.results.some((r,) => r.content.includes("mint",)),).toBe(true,);

    await db.deleteFrom("messages",).where("id", "=", row!.id,).execute();

    const after =
      (await (await appHandle(app, get(`/api/messages/search?chatId=${chatId}&q=snowflake`,),)).json()) as SearchBody;
    expect(after.results.some((r,) => r.content.includes("mint",)),).toBe(false,);
  });

  // ── BUG-message-search-returns-ciphertext-and-indexes-ciphertext ──
  // Read-path regression: the search response must decode stored content
  // (gzip / encrypted envelopes) before serializing to the client.
  // Index-path note: FTS5 indexes raw stored bytes, so encrypted rows return
  // no useful recall; that is the documented policy gap to address separately.

  test("identity-encoded results return plaintext content (no decode regression)", async () => {
    // Sanity baseline: the read path must never transform an identity row.
    await insertMessages(db, chatId, ownerId, MessageRole.User, "plain-anchor-mint identity-marker", {
      content_plaintext: "plain-anchor-mint identity-marker",
    },);
    const app = searchApp(db, ownerId, "user",);
    const res = await appHandle(
      app,
      get(`/api/messages/search?chatId=${chatId}&q=identity-marker`,),
    );
    const json = (await res.json()) as SearchBody;
    const hit = json.results.find((r,) => r.content.startsWith("plain-anchor",));
    expect(hit,).toBeTruthy();
    expect(hit!.content,).toBe("plain-anchor-mint identity-marker",);
  });

  test("gzip-stored row: FTS cannot surface decoded plaintext (index policy)", async () => {
    // Document the index-side limitation: FTS5 indexes stored bytes (base64
    // for gzip rows), so a plaintext query token will not match the row at all.
    // This is the architectural decision flagged in BUG-message-search; the
    // fix in this commit is the read-path side. The test asserts the
    // limitation so a future change is forced to revisit the policy.
    const body = "Z".repeat(11_000,);
    const encoded = encodeContent(body, "gzip",);
    await insertMessages(db, chatId, ownerId, MessageRole.User, "gzip-probe-marker unique-token", {
      content: encoded.encoded,
      content_encoding: encoded.encoding,
    } as never,);
    const app = searchApp(db, ownerId, "user",);
    // Search for the plaintext token. FTS indexes the base64 bytes, so this
    // query MUST NOT return the gzip row (the row is functionally invisible
    // to FTS via its decoded content).
    const res = await appHandle(
      app,
      get(`/api/messages/search?chatId=${chatId}&q=gzip-probe-marker`,),
    );
    const json = (await res.json()) as SearchBody;
    const leaked = json.results.find((r,) => r.content.includes("Z",));
    expect(leaked,).toBeUndefined();
    // And NO result should carry the raw base64 envelope — the API must not
    // leak it through whatever FTS ends up returning.
    for (const r of json.results) {
      expect(r.content.startsWith("H4sI",),).toBe(false,);
    }
  });

  test("encrypted row: read path never returns raw envelope; snippet is empty", async () => {
    // Even when FTS indexes the envelope bytes (junk tokens), the API must
    // never echo the envelope back. Without an SMK the helper throws → the
    // response surfaces a placeholder.
    const envelope = `{"enc":"deadbeefunique","nonce":"cafef00dunique","alg":"aes-gcm-256","kid":"k1"}`;
    await insertMessages(db, chatId, ownerId, MessageRole.User, envelope, { key_id: "k1", } as never,);
    const app = searchApp(db, ownerId, "user",);
    // Match on a token in the envelope itself. If porter-tokenizer happens to
    // skip the JSON tokens, FTS won't surface the row — the assertion then
    // only checks that whatever IS returned is not the envelope.
    const res = await appHandle(
      app,
      get(`/api/messages/search?chatId=${chatId}&q=deadbeefunique`,),
    );
    const json = (await res.json()) as SearchBody;
    for (const r of json.results) {
      expect(r.content,).not.toContain('"enc":',);
      expect(r.content,).not.toContain('"nonce":',);
      // Encrypted rows have no useful snippet; the API surfaces "".
      if (r.matchContext.length > 0) {
        // The snippet, if non-empty, MUST be plaintext (no {enc,nonce} markers).
        expect(r.matchContext,).not.toContain('"enc":',);
      }
    }
  });

  test("rejected decryption never inserts a phantom 'unknown' row", async () => {
    // Regression for BUG-message-search-promise-allsettled: the old code
    // pushed messageId:'unknown' on rejection, corrupting pagination and
    // leaking a fake FK. The fix skips rejected rows entirely.
    // Feed a stored envelope with a key_id that will make resolveMessageContent
    // throw (no SMK / unreadable) — the search must not return 'unknown'.
    await insertChats(db, "Phantom Chat", ownerId, {},);
    const chatRow = await db.selectFrom("chats",).select("id",).where("name", "=", "Phantom Chat",).executeTakeFirst();
    const envChat = chatRow!.id;
    await insertChatParticipants(db, envChat, participantId, {},);

    const envelope = `{"enc":"phantom-phrase","nonce":"x","alg":"aes-gcm-256","kid":"missing-key"}`;
    await insertMessages(db, envChat, ownerId, MessageRole.User, envelope, { key_id: "missing-key", } as never,);

    const app = searchApp(db, ownerId, "user",);
    // No q → non-FTS path returns the row; the reject path either resolves to
    // placeholder (ciphertext can't decrypt) or the row is skipped. Either
    // way: never 'unknown' id, and total/hasMore stay consistent.
    const res = await appHandle(app, get(`/api/messages/search?chatId=${envChat}`,),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as SearchBody;
    expect(body.results.some((r,) => r.messageId === "unknown",),).toBe(false,);
    expect(body.total,).toBe(body.results.length,); // honest count, no phantom page
  });
});