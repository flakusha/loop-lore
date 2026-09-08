// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for resolveChatKnownEntityNames.
 *
 * Verifies the chat-scoped known-entity-name resolver used by
 * `applyPostStoreEffects` and `triggerStoryModeGeneration` to populate
 * hallucination-guard's `knownEntityNames` pathway.
 *
 * BUG-hallucination-guard-isKnownEntity-stubs-unused: this helper closes
 * the gap where participants and the current location were not excluded
 * from hallucination detection.
 */

import { beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { uid, } from "../../utils";
import { resolveChatKnownEntityNames, } from "./resolve-known-names";

describe("resolveChatKnownEntityNames", () => {
  let db: Kysely<DB>;
  let userId: string;
  let chatId: string;

  beforeAll(async () => {
    createLogger({ level: "error" },);
    const testDb = await createTestDb();
    db = testDb.db;

    userId = uid();
    chatId = uid();
    // Direct Kysely inserts to avoid pulling in the entire insert-helpers
    // surface (which has dozens of unrelated typed wrappers).
    await db.insertInto("users",)
      .values({ id: userId, username: "rkn-user", display_name: "RKN User", role: "user", status: "active", },)
      .execute();
    await db.insertInto("chats",)
      .values({ id: chatId, name: "RKN Chat", created_by: userId, },)
      .execute();
  },);

  test("returns an empty array for a chat with no participants and no location", async () => {
    const names = await resolveChatKnownEntityNames(db, chatId,);
    expect(names,).toEqual([]);
  });

  test("returns participant display names", async () => {
    const aliceId = uid();
    const bobId = uid();
    await db.insertInto("actors",)
      .values({ id: aliceId, display_name: "Alice", },)
      .execute();
    await db.insertInto("actors",)
      .values({ id: bobId, display_name: "Bob", },)
      .execute();
    await db.insertInto("chat_participants",)
      .values({ chat_id: chatId, actor_id: aliceId, },)
      .execute();
    await db.insertInto("chat_participants",)
      .values({ chat_id: chatId, actor_id: bobId, },)
      .execute();

    const names = await resolveChatKnownEntityNames(db, chatId,);
    expect(names.sort(),).toEqual(["Alice", "Bob",]);
  });

  test("includes the current location name", async () => {
    const worldId = uid();
    const locationId = uid();
    await db.insertInto("worlds",)
      .values({ id: worldId, name: "RKN World", owner_id: userId, },)
      .execute();
    await db.insertInto("locations",)
      .values({ id: locationId, world_id: worldId, name: "Riverwood", },)
      .execute();
    await db.updateTable("chats",)
      .set({ current_location_id: locationId, },)
      .where("id", "=", chatId,)
      .execute();

    const names = await resolveChatKnownEntityNames(db, chatId,);
    expect(names,).toContain("Riverwood",);
  });

  test("deduplicates when participant name matches location name", async () => {
    // Use the same chat; participant "Alice" already exists from earlier test.
    const dupWorldId = uid();
    const dupLocationId = uid();
    await db.insertInto("worlds",)
      .values({ id: dupWorldId, name: "RKN World 2", owner_id: userId, },)
      .execute();
    await db.insertInto("locations",)
      .values({ id: dupLocationId, world_id: dupWorldId, name: "Alice", },)
      .execute();
    await db.updateTable("chats",)
      .set({ current_location_id: dupLocationId, },)
      .where("id", "=", chatId,)
      .execute();

    const names = await resolveChatKnownEntityNames(db, chatId,);
    const aliceCount = names.filter((n,) => n === "Alice",).length;
    expect(aliceCount,).toBe(1,);
  });

  test("returns empty array when chat does not exist (graceful failure)", async () => {
    const names = await resolveChatKnownEntityNames(db, "nonexistent-chat-id",);
    expect(names,).toEqual([]);
  });
});
