// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for the story-context prompt section. */
import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, resetTestDb, } from "../../../test-utils/create-test-db";
import {
  insertLocations,
  insertLocationStates,
  insertUsers,
  insertWorlds,
} from "../../../test-utils/insert-helpers";
import type { AssembleContext, } from "../types";
import { storyContextSection, } from "./story-context";

createLogger({ level: "error", },);

let db: Kysely<DB>;
let sqlite: Database;

beforeAll(async () => {
  const testDb = await createTestDb();
  db = testDb.db;
  sqlite = testDb.sqlite;
},);

afterAll(async () => {
  await db.destroy();
},);

beforeEach(async () => {
  resetTestDb(sqlite,);
  await insertUsers(db, "owner", "Owner", { id: "user-owner", },);
  await insertWorlds(db, "user-owner", "World", { id: "world-1", },);
  await insertLocations(db, "world-1", "Tavern", {
    id: "loc-1",
    description: "A rowdy dockside tavern.",
  },);
  await insertLocationStates(db, "loc-1", "world-1", {
    time_of_day: "evening",
    weather: "rain",
    atmosphere: "tense",
  },);
},);

function ctx(overrides: Record<string, unknown> = {},): AssembleContext {
  return {
    db,
    isStory: true,
    chat: { id: "chat-1", world_id: "world-1", current_location_id: "loc-1", },
    ...overrides,
  } as AssembleContext;
}

describe("storyContextSection", () => {
  test("enabled only for story chats", () => {
    expect(storyContextSection.enabled(ctx(),),).toBe(true,);
    expect(storyContextSection.enabled(ctx({ isStory: false, },),),).toBe(false,);
  });

  test("builds location plus state into one system message", async () => {
    const out = await storyContextSection.build(ctx(),);
    expect(out.length,).toBe(1,);
    expect(out[0]?.role,).toBe("system",);
    const content = out[0]?.content as string;
    expect(content,).toContain("Current location: Tavern",);
    expect(content,).toContain("A rowdy dockside tavern.",);
    expect(content,).toContain("Time: evening",);
    expect(content,).toContain("Weather: rain",);
    expect(content,).toContain("Atmosphere: tense",);
  });

  test("no world or location yields nothing", async () => {
    const noWorld = ctx({ chat: { id: "chat-1", world_id: null, current_location_id: null, }, },);
    expect(await storyContextSection.build(noWorld,),).toEqual([],);
    const noLocation = ctx({
      chat: { id: "chat-1", world_id: "world-1", current_location_id: null, },
    },);
    expect(await storyContextSection.build(noLocation,),).toEqual([],);
  });
});
