import type { Database, } from "bun:sqlite";
import { afterAll, afterEach, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { MessageRole, MessageStatus, MessageVisibility, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActorLoreEntries,
  insertActors,
  insertChats,
  insertMessages,
  insertUsers,
  insertWorldLoreEntries,
  insertWorlds,
} from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { deriveSearchTokens, } from "./encrypted-tokens";
import {
  indexActorLoreSearchTokens,
  indexWorldLoreSearchTokens,
  matchLoreEntriesByTokens,
  matchLoreIdsByTokens,
  reindexLoreTokens,
} from "./lore-token-store";
import { indexMessageSearchTokens, matchMessageIdsByTokens, } from "./token-store";

let db: Kysely<DB>;
let sqlite: Database;
let ownerId: string;
let otherOwnerId: string;
let unkeyedOwnerId: string;
let worldId: string;
let otherWorldId: string;
let actorId: string;
let chatId: string;
let messageId: string;
let worldEntryId: string;
let actorEntryId: string;

const OWNER_KEY = "a".repeat(64,);
const OTHER_KEY = "b".repeat(64,);
const PLAINTEXT = "tavern song about dragons";
const ENTRY_NAME = "Dragon Tavern";

beforeAll(async () => {
  ({ db, sqlite, } = await createTestDb());
  ownerId = uid();
  otherOwnerId = uid();
  unkeyedOwnerId = uid();
  worldId = uid();
  otherWorldId = uid();
  actorId = uid();
  chatId = uid();
  messageId = uid();
  worldEntryId = uid();
  actorEntryId = uid();

  await insertUsers(db, "lore-token-owner", "Owner", {
    id: ownerId,
    encryption_secret: OWNER_KEY,
  } as never,);

  await insertUsers(db, "lore-token-other", "Other", {
    id: otherOwnerId,
    encryption_secret: OTHER_KEY,
  } as never,);

  await insertUsers(db, "lore-token-unkeyed", "Unkeyed", {
    id: unkeyedOwnerId,
    encryption_secret: null,
  } as never,);

  await insertWorlds(db, ownerId, "Lore world", { id: worldId, },);
  // Second owner's world: same shape, different key + scope.
  await insertWorlds(db, otherOwnerId, "Other world", { id: otherWorldId, },);
  await insertActors(db, "Lore keeper", {
    id: actorId,
    owner_id: ownerId,
    user_id: ownerId,
  } as never,);

  worldEntryId = await insertWorldLoreEntries(db, worldId, PLAINTEXT, {
    id: worldEntryId,
    name: ENTRY_NAME,
  },);

  actorEntryId = await insertActorLoreEntries(db, actorId, PLAINTEXT, {
    id: actorEntryId,
    name: ENTRY_NAME,
    world_id: worldId,
  },);

  // Encrypted message in a chat owned by the same user, for the domain
  // isolation proof: same plaintext, same key, same scope — three tables.
  await insertChats(db, "Lore token chat", ownerId, {
    id: chatId,
    encryption_level: "standard",
  },);

  await insertMessages(db, chatId, actorId, MessageRole.User, "ciphertext-blob", {
    id: messageId,
    key_id: "k-lore-proof",
    content_plaintext: null,
    status: MessageStatus.Confirmed,
    visibility: MessageVisibility.Visible,
  },);
},);

afterAll(async () => {
  await db.destroy();
  sqlite.close();
},);

afterEach(() => {
  delete process.env.ENABLE_TOKEN_INDEXING;
},);

async function tokenRowsFor(
  table: "world_lore_search_tokens" | "actor_lore_search_tokens",
  entryId: string,
): Promise<{ term: string; scope: string }[]> {
  return await db
    .selectFrom(table,)
    .select(["term", "scope",],)
    .where("entry_id", "=", entryId,)
    .execute();
}

describe("search/lore-token-store (reindex + match)", () => {
  test("reindex stores derived tokens and match finds the entry", async () => {
    const stored = await reindexLoreTokens(
      db,
      "world_lore_search_tokens",
      worldEntryId,
      `${ENTRY_NAME} ${PLAINTEXT}`,
      OWNER_KEY,
      ownerId,
    );

    expect(stored,).toBeGreaterThan(0,);

    const query = await deriveSearchTokens("tavern dragons", OWNER_KEY,);
    const matches = await matchLoreIdsByTokens(db, "world_lore_search_tokens", query, ownerId,);
    expect(matches.map((m,) => m.entryId),).toContain(worldEntryId,);
    expect(matches[0]?.hits,).toBeGreaterThanOrEqual(2,);
  });

  test("actor table stores and matches independently of the world table", async () => {
    await reindexLoreTokens(db, "actor_lore_search_tokens", actorEntryId, PLAINTEXT, OWNER_KEY, ownerId,);

    const query = await deriveSearchTokens("tavern", OWNER_KEY,);
    const worldMatches = await matchLoreIdsByTokens(db, "world_lore_search_tokens", query, ownerId,);
    expect(worldMatches.map((m,) => m.entryId),).not.toContain(actorEntryId,);

    const actorMatches = await matchLoreIdsByTokens(db, "actor_lore_search_tokens", query, ownerId,);
    expect(actorMatches.map((m,) => m.entryId),).toEqual([actorEntryId,],);
  });

  test("owner isolation: a second owner's secret finds nothing", async () => {
    const ownerTokens = await deriveSearchTokens("tavern", OWNER_KEY,);
    const otherTokens = await deriveSearchTokens("tavern", OTHER_KEY,);
    // Different secret → different blind tokens...
    expect(otherTokens,).not.toEqual(ownerTokens,);
    expect(
      await matchLoreIdsByTokens(db, "world_lore_search_tokens", otherTokens, otherOwnerId,),
    ).toEqual([],);

    // ...and the owner's tokens under a foreign scope are equally invisible.
    expect(
      await matchLoreIdsByTokens(db, "world_lore_search_tokens", ownerTokens, otherOwnerId,),
    ).toEqual([],);
  });

  test("reindex is idempotent", async () => {
    await reindexLoreTokens(db, "world_lore_search_tokens", worldEntryId, PLAINTEXT, OWNER_KEY, ownerId,);
    await reindexLoreTokens(db, "world_lore_search_tokens", worldEntryId, PLAINTEXT, OWNER_KEY, ownerId,);

    const query = await deriveSearchTokens("tavern", OWNER_KEY,);
    const matches = await matchLoreIdsByTokens(db, "world_lore_search_tokens", query, ownerId,);
    expect(matches.filter((m,) => m.entryId === worldEntryId),).toHaveLength(1,);
  });

  test("empty token query short-circuits", () => {
    expect(matchLoreIdsByTokens(db, "world_lore_search_tokens", [], ownerId,),).resolves.toEqual([],);
  });
});

describe("search/lore-token-store (flag-gated indexing)", () => {
  test("flag off (default): writes nothing", async () => {
    const freshId = await insertWorldLoreEntries(db, worldId, "untouched lore text",);
    const written = await indexWorldLoreSearchTokens(db, { entryId: freshId, },);
    expect(written,).toBe(0,);
    expect(await tokenRowsFor("world_lore_search_tokens", freshId,),).toEqual([],);
  });

  test("flag on: world entry tokens land under the owner's scope", async () => {
    process.env.ENABLE_TOKEN_INDEXING = "1";
    // Words ≥3 chars across name + content: dragon, tavern, song, about, dragons.
    const written = await indexWorldLoreSearchTokens(db, { entryId: worldEntryId, },);
    expect(written,).toBe(5,);

    const rows = await tokenRowsFor("world_lore_search_tokens", worldEntryId,);
    expect(rows,).toHaveLength(5,);
    for (const row of rows) {
      expect(row.scope,).toBe(ownerId,);
      expect(row.term,).toHaveLength(16,);
    }

    const query = await deriveSearchTokens("tavern dragons", OWNER_KEY,);
    const matches = await matchLoreIdsByTokens(db, "world_lore_search_tokens", query, ownerId,);
    expect(matches.map((m,) => m.entryId),).toContain(worldEntryId,);
  });

  test("flag on: actor entry indexed under the actor's owner", async () => {
    process.env.ENABLE_TOKEN_INDEXING = "1";
    const written = await indexActorLoreSearchTokens(db, { entryId: actorEntryId, },);
    expect(written,).toBe(5,);

    const rows = await tokenRowsFor("actor_lore_search_tokens", actorEntryId,);
    for (const row of rows) { expect(row.scope,).toBe(ownerId,); }
  });

  test("skips entries whose owner has no usable encryption secret", async () => {
    process.env.ENABLE_TOKEN_INDEXING = "1";
    const unkeyedWorldId = await insertWorlds(db, unkeyedOwnerId, "Unkeyed world",);
    const unkeyedEntryId = await insertWorldLoreEntries(db, unkeyedWorldId, "sealed knowledge here",);

    const written = await indexWorldLoreSearchTokens(db, { entryId: unkeyedEntryId, },);
    expect(written,).toBe(0,);
    expect(await tokenRowsFor("world_lore_search_tokens", unkeyedEntryId,),).toEqual([],);
  });

  test("missing entry row fails open with zero writes", async () => {
    process.env.ENABLE_TOKEN_INDEXING = "1";
    const written = await indexWorldLoreSearchTokens(db, { entryId: uid(), },);
    expect(written,).toBe(0,);
  });
});

describe("search/lore-token-store (matchLoreEntriesByTokens)", () => {
  test("flag off: silent fallback even with rows present", async () => {
    // Seed rows through the flag-independent API.
    await reindexLoreTokens(db, "world_lore_search_tokens", worldEntryId, PLAINTEXT, OWNER_KEY, ownerId,);
    await reindexLoreTokens(db, "actor_lore_search_tokens", actorEntryId, PLAINTEXT, OWNER_KEY, ownerId,);

    expect(await matchLoreEntriesByTokens(db, { worldId, query: PLAINTEXT, },),).toEqual([],);
  });

  test("flag on: matches both domains under the world owner's key", async () => {
    process.env.ENABLE_TOKEN_INDEXING = "1";
    await reindexLoreTokens(db, "world_lore_search_tokens", worldEntryId, PLAINTEXT, OWNER_KEY, ownerId,);
    await reindexLoreTokens(db, "actor_lore_search_tokens", actorEntryId, PLAINTEXT, OWNER_KEY, ownerId,);

    const hits = await matchLoreEntriesByTokens(db, { worldId, query: PLAINTEXT, },);
    const bySource = new Map(hits.map((h,) => [h.source, h.entryId,]),);
    expect(bySource.get("world",),).toBe(worldEntryId,);
    expect(bySource.get("actor",),).toBe(actorEntryId,);
  });

  test("flag on: another world's owner finds nothing in this world", async () => {
    process.env.ENABLE_TOKEN_INDEXING = "1";
    expect(
      await matchLoreEntriesByTokens(db, { worldId: otherWorldId, query: PLAINTEXT, },),
    ).toEqual([],);
  });
});

describe("search/lore-token-store (domain isolation)", () => {
  test("message token reads never hit lore rows and vice versa", async () => {
    // Same plaintext, same owner key, same scope — indexed into all three
    // token stores. Each reader must see only its own table's rows.
    process.env.ENABLE_TOKEN_INDEXING = "1";
    const msgWritten = await indexMessageSearchTokens(db, {
      messageId,
      chatId,
      plaintext: PLAINTEXT,
      keyId: "k-lore-proof",
    },);

    expect(msgWritten,).toBeGreaterThan(0,);
    await reindexLoreTokens(db, "world_lore_search_tokens", worldEntryId, PLAINTEXT, OWNER_KEY, ownerId,);
    await reindexLoreTokens(db, "actor_lore_search_tokens", actorEntryId, PLAINTEXT, OWNER_KEY, ownerId,);

    const tokens = await deriveSearchTokens(PLAINTEXT, OWNER_KEY,);

    const messageMatches = await matchMessageIdsByTokens(db, tokens, ownerId,);
    expect(messageMatches.map((m,) => m.messageId),).toEqual([messageId,],);

    const worldMatches = await matchLoreIdsByTokens(db, "world_lore_search_tokens", tokens, ownerId,);
    expect(worldMatches.map((m,) => m.entryId),).toEqual([worldEntryId,],);

    const actorMatches = await matchLoreIdsByTokens(db, "actor_lore_search_tokens", tokens, ownerId,);
    expect(actorMatches.map((m,) => m.entryId),).toEqual([actorEntryId,],);
  });
});
