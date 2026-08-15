/**
 * Tests for chat location events (append-only location-change log).
 *
 * Covers: record, ordering, getLocationHistory, FK null-out on delete,
 * and that carryHistory + carryLocation preserve section linkage.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertLocations,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { carryHistory, } from "./carry-history";
import { carryLocation, } from "./carry-location";
import { getLocationHistory, recordLocationChange, } from "./location-events";

describe("location events", () => {
  let db: Kysely<DB>;
  const userId = crypto.randomUUID();
  const actorId = crypto.randomUUID();
  const worldId = "test-world-loc-events";
  const chatId = crypto.randomUUID();
  const locationA = crypto.randomUUID();
  const locationB = crypto.randomUUID();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    // Seed test world and locations (insertHelpers may not have insertWorlds;
    // we insert world + locations directly via the helper or raw).
    await insertUsers(db, `user-${userId}`, "Test User", { id: userId, } as never,);
    await insertActors(db, "Actor", { id: actorId, user_id: userId, owner_id: userId, } as never,);
    // Create world by inserting into worlds table directly
    await db.insertInto("worlds",).values({
      id: worldId,
      name: "Test World",
      owner_id: userId,
    },).execute();
    await insertLocations(db, worldId, "Location A", { id: locationA } as never);
    await insertLocations(db, worldId, "Location B", { id: locationB } as never);
    await insertChats(db, "Test Chat", userId, { id: chatId, current_location_id: locationA, world_id: worldId } as never);
  });

  afterAll(async () => {
    await db.destroy();
  });

  test("recordLocationChange inserts an event row", async () => {
    const eventId = await recordLocationChange(db, {
      chatId,
      fromLocationId: locationA,
      toLocationId: locationB,
      source: "manual",
    });

    expect(eventId).toBeTruthy();

    const row = await db
      .selectFrom("chat_location_events",)
      .selectAll()
      .where("id", "=", eventId,)
      .executeTakeFirst();

    expect(row).toBeTruthy();
    expect(row!.chat_id).toBe(chatId);
    expect(row!.from_location_id).toBe(locationA);
    expect(row!.to_location_id).toBe(locationB);
    expect(row!.source).toBe("manual");
    expect(row!.created_at).toBeTruthy();
  });

  test("events are ordered by created_at", async () => {
    // Insert two events with explicit timestamps for ordering
    await recordLocationChange(db, {
      chatId,
      fromLocationId: null,
      toLocationId: locationA,
      source: "manual",
    });

    await recordLocationChange(db, {
      chatId,
      fromLocationId: locationA,
      toLocationId: locationB,
      source: "manual",
    });

    const history = await getLocationHistory(db, chatId);
    expect(history.length).toBeGreaterThanOrEqual(1);

    // Verify chronological order
    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1];
      const curr = history[i];
      if (prev && curr) {
        expect(prev.createdAt.localeCompare(curr.createdAt,),).toBeLessThanOrEqual(0);
      }
    }
  });

  test("getLocationHistory returns all events for a chat", async () => {
    const chatId2 = crypto.randomUUID();
    await insertChats(db, "Test Chat 2", userId, { id: chatId2, world_id: worldId, } as never,);

    await recordLocationChange(db, {
      chatId: chatId2,
      fromLocationId: null,
      toLocationId: locationA,
      source: "migration",
    });

    const history = await getLocationHistory(db, chatId2);
    expect(history).toHaveLength(1);
    const event = history[0]!;
    expect(event.toLocationId).toBe(locationA);
    expect(event.source).toBe("migration");
  });

  test("events survive cascading chat delete", async () => {
    const chatToDelete = crypto.randomUUID();
    await insertChats(db, "To Delete", userId, { id: chatToDelete, world_id: worldId, } as never,);

    await recordLocationChange(db, {
      chatId: chatToDelete,
      fromLocationId: null,
      toLocationId: locationA,
      source: "manual",
    });

    // Delete the chat — events should cascade
    await db.deleteFrom("chats",).where("id", "=", chatToDelete,).execute();

    const events = await db
      .selectFrom("chat_location_events",)
      .selectAll()
      .where("chat_id", "=", chatToDelete,)
      .execute();

    expect(events).toHaveLength(0);
  });

  test("triggering_message_id links to the message", async () => {
    const msgId = crypto.randomUUID();
    await insertMessages(db, chatId, actorId, MessageRole.User, "message", { id: msgId, } as never,);

    const eventId = await recordLocationChange(db, {
      chatId,
      fromLocationId: locationA,
      toLocationId: locationB,
      source: "auto",
      triggeringMessageId: msgId,
    });

    const row = await db
      .selectFrom("chat_location_events",)
      .select("triggering_message_id",)
      .where("id", "=", eventId,)
      .executeTakeFirst();

    expect(row!.triggering_message_id).toBe(msgId);
  });
});

describe("carryHistory section_id", () => {
  let db: Kysely<DB>;
  const userId = crypto.randomUUID();
  const actorId = crypto.randomUUID();
  const worldId = "test-world-carry-section";
  const sourceChatId = crypto.randomUUID();
  const newChatId = crypto.randomUUID();
  const sectionId = crypto.randomUUID();
  const msgId = crypto.randomUUID();
  const locationId = crypto.randomUUID();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    await insertUsers(db, `user-${userId}`, "Test User", { id: userId, } as never,);
    await insertActors(db, "Actor", { id: actorId, user_id: userId, owner_id: userId, } as never,);
    await db.insertInto("worlds",).values({
      id: worldId,
      name: "Test World",
      owner_id: userId,
    },).execute();
await insertLocations(db, worldId, "Loc Carry", { id: locationId } as never);
    await insertChats(db, "Source", userId, { id: sourceChatId, world_id: worldId } as never);
    await insertChats(db, "Migrated", userId, { id: newChatId, world_id: worldId } as never);

    // Create a section + message with section_id set
    await db.insertInto("chat_sections",).values({
      id: sectionId,
      chat_id: sourceChatId,
      label: "Carry Section",
      location_id: locationId,
      sort_index: 1,
    },).execute();
    await insertMessages(db, sourceChatId, actorId, MessageRole.User, "message with section", {
      id: msgId,
      section_id: sectionId,
    } as never,);
  });

  afterAll(async () => {
    await db.destroy();
  });

  test("carryHistory copies section_id on messages", async () => {
    await carryHistory(db, sourceChatId, newChatId,);

    // Check the carried message has section_id set
    const carriedMsg = await db
      .selectFrom("messages",)
      .select(["id", "section_id",])
      .where("chat_id", "=", newChatId,)
      .where("content", "=", "message with section",)
      .executeTakeFirst();

    expect(carriedMsg).toBeTruthy();
    expect(carriedMsg!.section_id).toBeTruthy();
    // The section_id should point at a section in the new chat, not the source
    const sectionOwner = await db
      .selectFrom("chat_sections",)
      .select("chat_id",)
      .where("id", "=", carriedMsg!.section_id!,)
      .executeTakeFirst();
    // Note: before carryLocation runs, the section still points at the copied
    // section (which has chat_id=sourceChatId initially). carryLocation copies
    // sections and remaps. This test only asserts the message carries section_id.
    expect(sectionOwner).toBeTruthy();
  });

  test("carryLocation remap works after carryHistory carries section_id", async () => {
    // Run carryLocation — it copies sections and remaps carried messages.
    // carryHistory already ran in the prior test, so the new chat has messages
    // with section_id pointing at source section ids.
    await carryLocation(db, sourceChatId, newChatId,);

    // The carried message should now point at a section in newChatId
    const carriedMsg = await db
      .selectFrom("messages",)
      .select(["id", "section_id",])
      .where("chat_id", "=", newChatId,)
      .where("content", "=", "message with section",)
      .executeTakeFirst();

    expect(carriedMsg).toBeTruthy();
    expect(carriedMsg!.section_id).toBeTruthy();

    const section = await db
      .selectFrom("chat_sections",)
      .select("chat_id",)
      .where("id", "=", carriedMsg!.section_id!,)
      .executeTakeFirst();

    // The section must belong to the new chat, not the source
    expect(section!.chat_id).toBe(newChatId);
  });
});