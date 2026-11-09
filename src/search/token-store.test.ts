import type { Database, } from "bun:sqlite";
import { afterAll, afterEach, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { MessageRole, MessageStatus, MessageVisibility, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertChats, insertMessages, insertUsers, } from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { deriveSearchTokens, } from "./encrypted-tokens";
import {
  deleteMessageTokens,
  indexMessageSearchTokens,
  isTokenIndexingEnabled,
  matchMessageIdsByTokens,
  reindexMessageTokens,
} from "./token-store";

let db: Kysely<DB>;
let sqlite: Database;
let userId: string;
let chatId: string;
let actorId: string;
let messageId: string;

const USER_KEY = "test-encryption-secret-hex";
/** Valid 64-char hex secret — `isUsableEncryptionSecret` rejects anything else. */
const HEX_KEY = "a".repeat(64,);
const PLAINTEXT = "tavern song about dragons";

beforeAll(async () => {
  ({ db, sqlite, } = await createTestDb());
  userId = uid();
  actorId = uid();
  chatId = uid();
  messageId = uid();
  await insertUsers(db, "token-tester", "Tester", { id: userId, encryption_secret: USER_KEY, } as never,);
  await insertActors(db, "Tester", { id: actorId, user_id: userId, } as never,);
  await insertChats(db, "Token chat", userId, { id: chatId, } as never,);
  // Encrypted row: ciphertext in `content`, no plaintext mirror.
  await insertMessages(db, chatId, actorId, MessageRole.User, "ciphertext-blob", {
    id: messageId,
    content_plaintext: null,
    status: MessageStatus.Confirmed,
    visibility: MessageVisibility.Visible,
  },);
},);

afterAll(async () => {
  await db.destroy();
  sqlite.close();
},);

describe("search/token-store (encrypted rows)", () => {
  test("reindex stores derived tokens and match finds the message", async () => {
    const stored = await reindexMessageTokens(db, messageId, PLAINTEXT, USER_KEY, userId,);
    expect(stored,).toBeGreaterThan(0,);
    const query = await deriveSearchTokens("tavern dragons", USER_KEY,);
    const matches = await matchMessageIdsByTokens(db, query, userId,);
    expect(matches.map((m,) => m.messageId),).toContain(messageId,);
    expect(matches[0]?.hits,).toBeGreaterThanOrEqual(2,);
  });

  test("scope isolates users: other scope sees nothing", () => {
    const query = deriveSearchTokens("tavern", USER_KEY,);
    expect(query.then((t,) => matchMessageIdsByTokens(db, t, "someone-else",)),).resolves.toEqual([],);
  });

  test("reindex is idempotent and delete removes all rows", async () => {
    await reindexMessageTokens(db, messageId, PLAINTEXT, USER_KEY, userId,);
    await reindexMessageTokens(db, messageId, PLAINTEXT, USER_KEY, userId,);
    const query = await deriveSearchTokens("tavern", USER_KEY,);
    expect(await matchMessageIdsByTokens(db, query, userId,),).toHaveLength(1,);
    await deleteMessageTokens(db, messageId,);
    expect(matchMessageIdsByTokens(db, query, userId,),).resolves.toEqual([],);
  });

  test("empty token query short-circuits", () => {
    expect(matchMessageIdsByTokens(db, [], userId,),).resolves.toEqual([],);
  });
});

describe("search/token-store (indexMessageSearchTokens)", () => {
  // Chat at a real encryption tier owned by a VALIDLY-keyed user (64-hex
  // secret — `isUsableEncryptionSecret` rejects anything shorter), plus a
  // level-none chat and an owner without a secret for the skip paths.
  let keyedUserId: string;
  let stdChatId: string;
  let noneChatId: string;
  let unkeyedChatId: string;
  let unkeyedUserId: string;
  let msgId: string;

  beforeAll(async () => {
    keyedUserId = uid();
    await insertUsers(db, "token-hex-keyed", "HexKeyed", {
      id: keyedUserId,
      encryption_secret: HEX_KEY,
    } as never,);

    stdChatId = await insertChats(db, "Token std chat", keyedUserId, {
      id: uid(),
      encryption_level: "standard",
    },);

    noneChatId = await insertChats(db, "Token none chat", userId, {
      id: uid(),
      encryption_level: "none",
    },);

    unkeyedUserId = uid();
    await insertUsers(db, "token-unkeyed", "Unkeyed", {
      id: unkeyedUserId,
      encryption_secret: null,
    } as never,);

    unkeyedChatId = await insertChats(db, "Token unkeyed chat", unkeyedUserId, {
      id: uid(),
      encryption_level: "standard",
    },);

    msgId = uid();
    await insertMessages(db, stdChatId, actorId, MessageRole.User, "sealed-blob", {
      id: msgId,
      key_id: "k-token-index",
      content_plaintext: null,
      status: MessageStatus.Confirmed,
      visibility: MessageVisibility.Visible,
    },);
  },);

  afterEach(() => {
    delete process.env.ENABLE_TOKEN_INDEXING;
  },);

  async function tokenRowsFor(messageId: string,): Promise<{ term: string; scope: string }[]> {
    return await db
      .selectFrom("message_search_tokens",)
      .select(["term", "scope",],)
      .where("message_id", "=", messageId,)
      .execute();
  }

  test("flag off (default): writes nothing", async () => {
    const written = await indexMessageSearchTokens(db, {
      messageId: msgId,
      chatId: stdChatId,
      plaintext: "tavern song about dragons",
      keyId: "k-token-index",
    },);

    expect(written,).toBe(0,);
    expect(await tokenRowsFor(msgId,),).toEqual([],);
  });

  test("isTokenIndexingEnabled mirrors the env var", () => {
    delete process.env.ENABLE_TOKEN_INDEXING;
    expect(isTokenIndexingEnabled(),).toBe(false,);
    process.env.ENABLE_TOKEN_INDEXING = "1";
    expect(isTokenIndexingEnabled(),).toBe(true,);
    process.env.ENABLE_TOKEN_INDEXING = "0";
    expect(isTokenIndexingEnabled(),).toBe(false,);
    delete process.env.ENABLE_TOKEN_INDEXING;
  });

  test("flag on: one token row per word of three characters or more", async () => {
    process.env.ENABLE_TOKEN_INDEXING = "1";
    const written = await indexMessageSearchTokens(db, {
      messageId: msgId,
      chatId: stdChatId,
      // Words ≥3 chars: tavern, song, about, dragons — "of"/"a" are dropped.
      plaintext: "tavern song about dragons",
      keyId: "k-token-index",
    },);

    expect(written,).toBe(4,);

    const rows = await tokenRowsFor(msgId,);
    expect(rows,).toHaveLength(4,);
    for (const row of rows) {
      expect(row.scope,).toBe(keyedUserId,);
      expect(row.term,).toHaveLength(16,);
    }

    // The stored tokens match what a search with the owner's key derives.
    const query = await deriveSearchTokens("tavern dragons", HEX_KEY,);
    const matches = await matchMessageIdsByTokens(db, query, keyedUserId,);
    expect(matches.map((m,) => m.messageId),).toContain(msgId,);
  });

  test("skips plaintext rows (key_id null)", async () => {
    process.env.ENABLE_TOKEN_INDEXING = "1";
    const written = await indexMessageSearchTokens(db, {
      messageId: msgId,
      chatId: stdChatId,
      plaintext: "anything",
      keyId: null,
    },);

    expect(written,).toBe(0,);
  });

  test("skips rows carrying a plaintext mirror (FTS-covered)", async () => {
    process.env.ENABLE_TOKEN_INDEXING = "1";
    const written = await indexMessageSearchTokens(db, {
      messageId: msgId,
      chatId: stdChatId,
      plaintext: "anything",
      keyId: "k-token-index",
      plaintextMirror: "anything",
    },);

    expect(written,).toBe(0,);
  });

  test("skips level-none chats (content is plaintext)", async () => {
    process.env.ENABLE_TOKEN_INDEXING = "1";
    const noneMsgId = uid();
    await insertMessages(db, noneChatId, actorId, MessageRole.User, "plain text", {
      id: noneMsgId,
      key_id: "k-none",
      content_plaintext: null,
    },);

    const written = await indexMessageSearchTokens(db, {
      messageId: noneMsgId,
      chatId: noneChatId,
      plaintext: "plain text",
      keyId: "k-none",
    },);

    expect(written,).toBe(0,);
    expect(await tokenRowsFor(noneMsgId,),).toEqual([],);
  });

  test("skips chats whose owner has no usable encryption secret", async () => {
    process.env.ENABLE_TOKEN_INDEXING = "1";
    const unkeyedMsgId = uid();
    await insertMessages(db, unkeyedChatId, actorId, MessageRole.User, "sealed-blob", {
      id: unkeyedMsgId,
      key_id: "k-unkeyed",
      content_plaintext: null,
    },);

    const written = await indexMessageSearchTokens(db, {
      messageId: unkeyedMsgId,
      chatId: unkeyedChatId,
      plaintext: "tavern song",
      keyId: "k-unkeyed",
    },);

    expect(written,).toBe(0,);
    expect(await tokenRowsFor(unkeyedMsgId,),).toEqual([],);
  });

  test("missing message row (FK) fails open with zero writes", async () => {
    process.env.ENABLE_TOKEN_INDEXING = "1";
    const written = await indexMessageSearchTokens(db, {
      messageId: uid(),
      chatId: stdChatId,
      plaintext: "tavern song",
      keyId: "k-ghost",
    },);

    expect(written,).toBe(0,);
  });
});
