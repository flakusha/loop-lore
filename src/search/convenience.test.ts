import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { AssetType, AssetVisibility, MessageRole, MessageStatus, MessageVisibility, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActorMemories,
  insertActors,
  insertAssets,
  insertChats,
  insertMessages,
  insertUsers,
} from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { searchAssets, searchMemories, searchMessages, } from "./convenience";

let db: Kysely<DB>;
let sqlite: Database;
let userId: string;
let actorId: string;
let chatId: string;

beforeAll(async () => {
  ({ db, sqlite, } = await createTestDb());
  userId = uid();
  actorId = uid();
  chatId = uid();
  await insertUsers(db, "conv-user", "User", { id: userId, } as never,);
  await insertActors(db, "Sage", { id: actorId, user_id: userId, } as never,);
  await insertChats(db, "Conv chat", userId, { id: chatId, } as never,);
  await insertMessages(db, chatId, actorId, MessageRole.User, "tavern song", {
    status: MessageStatus.Confirmed,
    visibility: MessageVisibility.Visible,
    content_plaintext: "tavern song about dragons",
  } as never,);
  await insertActorMemories(db, actorId, "the dragon hoard lies under the mountain", {} as never,);
  await insertAssets(db, userId, "Tavern interior.png", "image/png", AssetType.Image, 1024, "/tavern.png", {
    visibility: AssetVisibility.Public,
    alt_text: "cozy tavern hall",
  },);
},);

afterAll(async () => {
  await db.destroy();
  sqlite.close();
},);

describe("search/convenience", () => {
  test("searchMessages finds plaintext via keyword", async () => {
    const hits = await searchMessages(db, "tavern dragons", { userId, },);
    expect(hits.length,).toBeGreaterThan(0,);
    expect(hits[0]?.payload.chatId,).toBe(chatId,);
  });
  test("searchMemories finds actor content via keyword", async () => {
    const hits = await searchMemories(db, "dragon hoard", { actorId, },);
    expect(hits.map((h,) => h.payload.memoryId),).toHaveLength(1,);
  });
  test("searchAssets finds visible files via fuzzy", async () => {
    const hits = await searchAssets(db, "tavern", { userId, },);
    expect(hits.map((h,) => h.payload.filename),).toEqual(["Tavern interior.png",],);
  });
  test("blank queries return empty without touching tiers", () => {
    expect(searchMessages(db, "   ", { userId, },),).resolves.toEqual([],);
    expect(searchMemories(db, "", { actorId, },),).resolves.toEqual([],);
    expect(searchAssets(db, "", { userId, },),).resolves.toEqual([],);
  });
});
