import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { MessageRole, MessageStatus, MessageVisibility, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertChats, insertMessages, insertUsers, } from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { deriveSearchTokens, } from "./encrypted-tokens";
import { deleteMessageTokens, matchMessageIdsByTokens, reindexMessageTokens, } from "./token-store";

let db: Kysely<DB>;
let sqlite: Database;
let userId: string;
let chatId: string;
let actorId: string;
let messageId: string;

const USER_KEY = "test-encryption-secret-hex";
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
