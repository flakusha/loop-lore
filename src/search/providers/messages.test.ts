import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { MessageRole, MessageStatus, MessageVisibility, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { reindexMessageTokens, } from "../token-store";
import { createMessageProviders, } from "./messages";

let db: Kysely<DB>;
let sqlite: Database;
let ownerId: string;
let outsiderId: string;
let chatId: string;
let plainId: string;
let encryptedId: string;

const USER_KEY = "owner-encryption-secret";

const BASE_OPTS: { status: MessageStatus; visibility: MessageVisibility } = {
  status: MessageStatus.Confirmed,
  visibility: MessageVisibility.Visible,
};

beforeAll(async () => {
  ({ db, sqlite, } = await createTestDb());
  ownerId = uid();
  outsiderId = uid();
  const actorId = uid();
  chatId = uid();
  plainId = uid();
  encryptedId = uid();
  await insertUsers(db, "msg-owner", "Owner", { id: ownerId, encryption_secret: USER_KEY, } as never,);
  await insertUsers(db, "msg-outsider", "Outsider", { id: outsiderId, } as never,);
  await insertActors(db, "Owner", { id: actorId, user_id: ownerId, } as never,);
  await insertChats(db, "Search chat", ownerId, { id: chatId, } as never,);
  await insertMessages(db, chatId, actorId, MessageRole.User, "tavern song", {
    ...BASE_OPTS,
    id: plainId,
    content_plaintext: "tavern song about dragons",
  },);
  await insertMessages(db, chatId, actorId, MessageRole.User, "ciphertext-blob", {
    ...BASE_OPTS,
    id: encryptedId,
    content_plaintext: null,
  },);
  await reindexMessageTokens(db, encryptedId, "secret tavern meeting", USER_KEY, ownerId,);
},);

afterAll(async () => {
  await db.destroy();
  sqlite.close();
},);

describe("search/providers/messages (exact)", () => {
  test("id lookup hits with score 1, misses return empty", async () => {
    const { exact, } = createMessageProviders(db,);
    const scope = { kind: "messages" as const, userId: ownerId, };
    const hits = await exact({ q: plainId, mode: "exact", }, scope,);
    expect(hits,).toHaveLength(1,);
    expect(hits[0]?.score,).toBe(1,);
    expect(hits[0]?.source,).toBe("db",);
    expect(exact({ q: uid(), mode: "exact", }, scope,),).resolves.toEqual([],);
  });
  test("outsiders cannot resolve ids in chats they cannot see", () => {
    const { exact, } = createMessageProviders(db,);
    const scope = { kind: "messages" as const, userId: outsiderId, };
    expect(exact({ q: plainId, mode: "exact", }, scope,),).resolves.toEqual([],);
  });
});

describe("search/providers/messages (keyword)", () => {
  test("FTS matches plaintext with snippet and bounded score", async () => {
    const { keyword, } = createMessageProviders(db,);
    const scope = { kind: "messages" as const, userId: ownerId, };
    const hits = await keyword({ q: "tavern dragons", mode: "keyword", }, scope,);
    expect(hits.map((h,) => h.id),).toContain(plainId,);
    const hit = hits.find((h,) => h.id === plainId);
    expect(hit?.payload.snippet,).toContain("<mark>",);
    expect(hit!.score,).toBeGreaterThan(0,);
    expect(hit!.score,).toBeLessThanOrEqual(1,);
  });
  test("chat scope pins results and outsiders see nothing", async () => {
    const { keyword, } = createMessageProviders(db,);
    const scoped = await keyword(
      { q: "tavern", mode: "keyword", },
      { kind: "messages" as const, userId: ownerId, chatId, },
    );
    expect(scoped.length,).toBeGreaterThan(0,);
    expect(scoped.every((h,) => h.payload.chatId === chatId),).toBe(true,);
    expect(
      keyword({ q: "tavern", mode: "keyword", }, { kind: "messages" as const, userId: outsiderId, },),
    ).resolves.toEqual([],);
  });
});

describe("search/providers/messages (token)", () => {
  test("encrypted rows match via tokens with encryptedMatch flag", async () => {
    const { token, } = createMessageProviders(db, {
      resolveKey: async (userId,) => (userId === ownerId ? USER_KEY : null),
    },);
    const hits = await token(
      { q: "secret meeting", mode: "hybrid", includeEncrypted: true, },
      { kind: "messages" as const, userId: ownerId, },
    );
    expect(hits.map((h,) => h.id),).toContain(encryptedId,);
    expect(hits.find((h,) => h.id === encryptedId)?.encryptedMatch,).toBe(true,);
  });
  test("missing resolver or key yields no hits", () => {
    const scope = { kind: "messages" as const, userId: ownerId, };
    const query = { q: "secret", mode: "hybrid", includeEncrypted: true, } as const;
    const { token, } = createMessageProviders(db,);
    expect(token(query, scope,),).resolves.toEqual([],);
    const withResolver = createMessageProviders(db, { resolveKey: async () => null, },);
    expect(withResolver.token(query, scope,),).resolves.toEqual([],);
  });
});
