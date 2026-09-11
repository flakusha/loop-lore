// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for playthrough completion with an ending. */
import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, resetTestDb, } from "../../../test-utils/create-test-db";
import {
  insertPlaythroughs,
  insertUsers,
  insertWorlds,
} from "../../../test-utils/insert-helpers";
import { completePlaythrough, } from "./endings";

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
  await insertPlaythroughs(db, "user-player", "world-1", { id: "run-1", status: "active", },);
  await insertPlaythroughs(db, "user-player", "world-1", { id: "run-done", status: "completed", },);
},);

describe("completePlaythrough", () => {
  test("completes an active run with ending details", async () => {
    const out = await completePlaythrough(db, "run-1", "ending-dawn", "good", 3600,);
    expect(out.isCompleted,).toBe(true,);
    expect(out.endingId,).toBe("ending-dawn",);
    expect(out.endingType,).toBe("good",);
    expect(out.completionTime,).toBe(3600,);
  });

  test("missing run throws", async () => {
    await expect(completePlaythrough(db, "run-missing", "e", "good", 1,),).rejects.toThrow(
      "Playthrough not found",
    );
  });

  test("already-completed run throws", async () => {
    await expect(completePlaythrough(db, "run-done", "e", "good", 1,),).rejects.toThrow(
      "Playthrough already completed",
    );
  });
});
