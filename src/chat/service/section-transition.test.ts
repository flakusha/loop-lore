/**
 * Tests for ensureSectionForLocation — the multi-location sectioning bridge.
 *
 * A manual location change must leave a journey section bound to the
 * destination: append-on-move, dedupe when the latest section already covers
 * the location, and fall back to a placeholder label when none is given.
 *
 * Resource contract (parallel-safe): one private in-memory DB per file
 * (createTestDb); the beforeAll-seeded user/world/locations are read-only
 * after seeding; every test owns a private chat (fresh UUID) and asserts only
 * on that chat's rows, so tests pass alone and in any order.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertChats, insertLocations, insertUsers, } from "../../test-utils/insert-helpers";
import { ensureSectionForLocation, } from "./section-transition";

describe("ensureSectionForLocation", () => {
  let db: Kysely<DB>;
  const userId = crypto.randomUUID();
  const worldId = "test-world-section-transition";
  const locationA = crypto.randomUUID();
  const locationB = crypto.randomUUID();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    await insertUsers(db, `user-${userId}`, "Section Transition User", { id: userId, } as never,);
    await db.insertInto("worlds",).values({
      id: worldId,
      name: "Section Transition World",
      owner_id: userId,
    },).execute();

    await insertLocations(db, worldId, "Tavern", { id: locationA, } as never,);
    await insertLocations(db, worldId, "Forest", { id: locationB, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  /** Private-chat factory: each test gets its own chat rows to assert on. */
  async function makeChat(name: string,): Promise<string> {
    const chatId = crypto.randomUUID();
    await insertChats(db, name, userId, { id: chatId, world_id: worldId, } as never,);
    return chatId;
  }

  async function sectionsOf(
    chatId: string,
  ): Promise<{ id: string; label: string; location_id: string | null; sort_index: number }[]> {
    return await db
      .selectFrom("chat_sections",)
      .select(["id", "label", "location_id", "sort_index",],)
      .where("chat_id", "=", chatId,)
      .orderBy("sort_index", "asc",)
      .execute();
  }

  test("creates a section bound to the location", async () => {
    const chatId = await makeChat("Bind Chat",);

    const sectionId = await ensureSectionForLocation(db, {
      chatId,
      locationId: locationA,
      label: "Tavern",
    },);

    expect(sectionId,).toBeTruthy();
    const sections = await sectionsOf(chatId,);
    expect(sections,).toHaveLength(1,);
    expect(sections[0],).toMatchObject({
      id: sectionId,
      label: "Tavern",
      location_id: locationA,
      sort_index: 1,
    },);
  });

  test("appends the next location with an increasing sort_index", async () => {
    const chatId = await makeChat("Append Chat",);
    await ensureSectionForLocation(db, { chatId, locationId: locationA, label: "Tavern", },);

    const sectionId = await ensureSectionForLocation(db, {
      chatId,
      locationId: locationB,
      label: "Forest",
    },);

    expect(sectionId,).toBeTruthy();
    const sections = await sectionsOf(chatId,);
    expect(sections,).toHaveLength(2,);
    expect(sections[1],).toMatchObject({
      id: sectionId,
      location_id: locationB,
      sort_index: 2,
    },);
  });

  test("is a no-op when the latest section already covers the location", async () => {
    const chatId = await makeChat("Dedupe Chat",);
    await ensureSectionForLocation(db, { chatId, locationId: locationA, label: "Tavern", },);
    await ensureSectionForLocation(db, { chatId, locationId: locationB, label: "Forest", },);

    const sectionId = await ensureSectionForLocation(db, {
      chatId,
      locationId: locationB,
      label: "Forest again",
    },);

    // Latest section (Forest) already covers the destination.
    expect(sectionId,).toBeNull();
    const sections = await sectionsOf(chatId,);
    expect(sections,).toHaveLength(2,);
    expect(sections[1]?.label,).toBe("Forest",);
  });

  test("falls back to a placeholder label when none is given", async () => {
    const chatId = await makeChat("No Label Chat",);

    await ensureSectionForLocation(db, { chatId, locationId: locationA, },);

    const sections = await sectionsOf(chatId,);
    expect(sections,).toHaveLength(1,);
    expect(sections[0]?.label,).toBe(`Location ${locationA.slice(0, 8,)}`,);
    expect(sections[0]?.location_id,).toBe(locationA,);
  });
});
