/**
 * Tests for ensureSectionForLocation — the multi-location sectioning bridge.
 *
 * A manual location change must leave a journey section bound to the
 * destination: append-on-move, dedupe when the latest section already covers
 * the location, and fall back to a placeholder label when none is given.
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
  const chatId = crypto.randomUUID();
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
    await insertChats(
      db,
      "Journey Chat",
      userId,
      { id: chatId, world_id: worldId, } as never,
    );
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  async function listSections(): Promise<
    { id: string; label: string; location_id: string | null; sort_index: number }[]
  > {
    return await db
      .selectFrom("chat_sections",)
      .select(["id", "label", "location_id", "sort_index",],)
      .where("chat_id", "=", chatId,)
      .orderBy("sort_index", "asc",)
      .execute();
  }

  test("creates a section bound to the location", async () => {
    const sectionId = await ensureSectionForLocation(db, {
      chatId,
      locationId: locationA,
      label: "Tavern",
    },);

    expect(sectionId,).toBeTruthy();
    const sections = await listSections();
    expect(sections,).toHaveLength(1,);
    expect(sections[0],).toMatchObject({
      id: sectionId,
      label: "Tavern",
      location_id: locationA,
      sort_index: 1,
    },);
  });

  test("appends the next location with an increasing sort_index", async () => {
    const sectionId = await ensureSectionForLocation(db, {
      chatId,
      locationId: locationB,
      label: "Forest",
    },);

    expect(sectionId,).toBeTruthy();
    const sections = await listSections();
    expect(sections,).toHaveLength(2,);
    expect(sections[1],).toMatchObject({
      id: sectionId,
      location_id: locationB,
      sort_index: 2,
    },);
  });

  test("is a no-op when the latest section already covers the location", async () => {
    const sectionId = await ensureSectionForLocation(db, {
      chatId,
      locationId: locationB,
      label: "Forest again",
    },);

    // Latest section (Forest) already covers the destination.
    expect(sectionId,).toBeNull();
    const sections = await listSections();
    expect(sections,).toHaveLength(2,);
    expect(sections[1]?.label,).toBe("Forest",);
  });

  test("falls back to a placeholder label when none is given", async () => {
    const chatId2 = crypto.randomUUID();
    await insertChats(db, "No Label Chat", userId, { id: chatId2, world_id: worldId, } as never,);

    await ensureSectionForLocation(db, { chatId: chatId2, locationId: locationA, },);

    const sections = await db
      .selectFrom("chat_sections",)
      .select(["label", "location_id",],)
      .where("chat_id", "=", chatId2,)
      .execute();

    expect(sections,).toHaveLength(1,);
    expect(sections[0]?.label,).toBe(`Location ${locationA.slice(0, 8,)}`,);
    expect(sections[0]?.location_id,).toBe(locationA,);
  });
});
