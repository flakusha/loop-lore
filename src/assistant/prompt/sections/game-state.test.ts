// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for the game-state prompt section. */
import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, resetTestDb, } from "../../../test-utils/create-test-db";
import { insertChats, insertGameStates, insertUsers, } from "../../../test-utils/insert-helpers";
import type { AssembleContext, } from "../types";
import { gameStateSection, } from "./game-state";

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
  // game_states.chat_id → chats.id (FK enforced), so seed chat-1 first.
  await insertChats(db, "Chat", "user-owner", { id: "chat-1", },);
},);

function ctx(): AssembleContext {
  return {
    db,
    chat: { id: "chat-1", },
  } as AssembleContext;
}

const STATE = JSON.stringify({
  grid: { w: 10, h: 8, },
  entities: [
    { id: "pc", name: "Aria", kind: "pc", x: 2, y: 3, },
    { id: "gob1", name: "Goblin", kind: "enemy", x: 7, y: 5, },
  ],
  analysis: "moved gob1 from (6,5) to (7,5)",
},);

describe("gameStateSection", () => {
  test("always enabled", () => {
    expect(gameStateSection.enabled(ctx(),),).toBe(true,);
  });

  test("renders instruction only when no state exists", async () => {
    const out = await gameStateSection.build(ctx(),);
    expect(out.length,).toBe(1,);
    expect(out[0]?.role,).toBe("system",);
    const content = out[0]?.content as string;
    expect(content,).toContain("game-state",);
    expect(content,).toContain('"grid":{"w":10,"h":8}',);
    expect(content,).toContain("pc|npc|enemy|object",);
    expect(content,).not.toContain("Current tracked state:",);
  });

  test("includes latest snapshot summary when rows exist", async () => {
    await insertGameStates(db, "chat-1", {
      id: "gs-old",
      state: JSON.stringify({ grid: { w: 5, h: 5, }, entities: [], },),
      created_at: "2026-01-01T00:00:00Z",
    },);

    await insertGameStates(db, "chat-1", {
      id: "gs-new",
      state: STATE,
      created_at: "2026-01-02T00:00:00Z",
    },);

    const out = await gameStateSection.build(ctx(),);
    const content = out[0]?.content as string;
    expect(content,).toContain("Current tracked state:",);
    expect(content,).toContain("Grid: 10x8.",);
    expect(content,).toContain("pc (Aria, pc) at (2,3)",);
    expect(content,).toContain("gob1 (Goblin, enemy) at (7,5)",);
    expect(content,).toContain("moved gob1 from (6,5) to (7,5)",);
    expect(content,).not.toContain("Grid: 5x5.",);
  });

  test("tolerates malformed stored JSON", async () => {
    await insertGameStates(db, "chat-1", { id: "gs-bad", state: "{not json", },);
    const out = await gameStateSection.build(ctx(),);
    const content = out[0]?.content as string;
    expect(content,).toContain("Current tracked state:",);
    expect(content,).not.toContain("Grid:",);
  });
});
