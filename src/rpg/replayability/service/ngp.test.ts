// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for new-game-plus start (gated on a completed previous run). */
import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, resetTestDb, } from "../../../test-utils/create-test-db";
import { insertPlaythroughs, insertUsers, insertWorlds, } from "../../../test-utils/insert-helpers";
import { startNewGamePlus, } from "./ngp";
import { PlusDifficulty, } from "./types";

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
  await insertUsers(db, "player", "Player", { id: "user-player", },);
  await insertWorlds(db, "user-player", "World", { id: "world-1", },);
  await insertPlaythroughs(db, "user-player", "world-1", { id: "run-done", status: "completed", },);
  await insertPlaythroughs(db, "user-player", "world-1", { id: "run-active", status: "active", },);
},);

describe("startNewGamePlus", () => {
  test("starts a plus run linked to the completed run", async () => {
    const out = await startNewGamePlus(db, {
      playerId: "user-player",
      worldId: "world-1",
      previousPlaythroughId: "run-done",
    },);
    expect(out.isCompleted,).toBe(false,);
    expect(out.difficulty,).toBe(PlusDifficulty.Hard,);
    expect(out.metadata,).toMatchObject({
      isNewGamePlus: true,
      previousPlaythroughId: "run-done",
      carryOverChoices: true,
      carryOverItems: false,
    },);
  });

  test("honors explicit difficulty and carry-over flags", async () => {
    const out = await startNewGamePlus(db, {
      playerId: "user-player",
      worldId: "world-1",
      previousPlaythroughId: "run-done",
      difficulty: PlusDifficulty.Nightmare,
      carryOverChoices: false,
      carryOverItems: true,
    },);
    expect(out.difficulty,).toBe(PlusDifficulty.Nightmare,);
    expect(out.metadata,).toMatchObject({ carryOverChoices: false, carryOverItems: true, },);
  });

  test("rejects unknown previous runs", async () => {
    await expect(startNewGamePlus(db, {
      playerId: "user-player",
      worldId: "world-1",
      previousPlaythroughId: "run-missing",
    },),).rejects.toThrow("Previous playthrough not found",);
  });

  test("rejects incomplete previous runs", async () => {
    await expect(startNewGamePlus(db, {
      playerId: "user-player",
      worldId: "world-1",
      previousPlaythroughId: "run-active",
    },),).rejects.toThrow("Previous playthrough not completed",);
  });
});
