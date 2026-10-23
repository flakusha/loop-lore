// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Class-level tests for ReplayabilityService: every public method against a real DB. */
import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, resetTestDb, } from "../../../test-utils/create-test-db";
import { insertUsers, insertWorlds, } from "../../../test-utils/insert-helpers";
import { ReplayabilityService, } from "./index";
import { EndingType, PlusDifficulty, } from "./types";

createLogger({ level: "error", },);

let db: Kysely<DB>;
let sqlite: Database;
let svc: ReplayabilityService;

beforeAll(async () => {
  const testDb = await createTestDb();
  db = testDb.db;
  sqlite = testDb.sqlite;
  svc = new ReplayabilityService(db,);
},);

afterAll(async () => {
  await db.destroy();
},);

beforeEach(async () => {
  resetTestDb(sqlite,);
  await insertUsers(db, "player", "Player", { id: "user-player", },);
  await insertWorlds(db, "user-player", "World", { id: "world-1", },);
},);

describe("ReplayabilityService", () => {
  test("startPlaythrough stores a first run for the player", async () => {
    const out = await svc.startPlaythrough({ playerId: "user-player", worldId: "world-1", },);

    expect(out.playthroughNumber,).toBe(1,);
    expect(out.difficulty,).toBe(PlusDifficulty.Normal,);
    expect(out.status,).toBe("active",);
    expect(out.isCompleted,).toBe(false,);
  });

  test("getPlaythrough returns the stored run and null for an unknown id", async () => {
    const started = await svc.startPlaythrough({ playerId: "user-player", worldId: "world-1", },);

    const found = await svc.getPlaythrough(started.id,);
    expect(found?.id,).toBe(started.id,);
    expect(await svc.getPlaythrough("run-missing",),).toBeNull();
  });

  test("getPlayerPlaythroughs lists the player's runs, optionally world-scoped", async () => {
    await svc.startPlaythrough({ playerId: "user-player", worldId: "world-1", },);

    const all = await svc.getPlayerPlaythroughs("user-player",);
    expect(all.length,).toBe(1,);
    expect(all[0]?.playerId,).toBe("user-player",);

    const scoped = await svc.getPlayerPlaythroughs("user-player", "world-1",);
    expect(scoped.length,).toBe(1,);
    expect(await svc.getPlayerPlaythroughs("user-player", "world-other",),).toEqual([],);
  });

  test("recordChoice bumps the choice counter", async () => {
    const started = await svc.startPlaythrough({ playerId: "user-player", worldId: "world-1", },);

    await svc.recordChoice(started.id,);

    const after = await svc.getPlaythrough(started.id,);
    expect(after?.choicesMade,).toBe(1,);
  });

  test("recordSecretFound stores the secret and counts it once", async () => {
    const started = await svc.startPlaythrough({ playerId: "user-player", worldId: "world-1", },);

    await svc.recordSecretFound(started.id, "secret-1",);
    await svc.recordSecretFound(started.id, "secret-1",);

    const after = await svc.getPlaythrough(started.id,);
    expect(after?.secretsFound,).toBe(1,);
    expect(after?.metadata.secrets,).toEqual(["secret-1",],);
  });

  test("completePlaythrough marks the run complete and updates meta-progression", async () => {
    const started = await svc.startPlaythrough({ playerId: "user-player", worldId: "world-1", },);

    const done = await svc.completePlaythrough(started.id, "ending-dawn", EndingType.Good, 3600,);
    expect(done.isCompleted,).toBe(true,);
    expect(done.endingId,).toBe("ending-dawn",);
    expect(done.endingType,).toBe(EndingType.Good,);
    expect(done.completionTime,).toBe(3600,);

    const meta = await svc.getMetaProgression("user-player",);
    expect(meta.totalPlaythroughs,).toBe(1,);
    expect(meta.endingsSeen,).toEqual(["ending-dawn",],);
  });

  test("startNewGamePlus seeds a hard run from the completed one", async () => {
    const started = await svc.startPlaythrough({ playerId: "user-player", worldId: "world-1", },);
    await svc.completePlaythrough(started.id, "ending-dawn", EndingType.Good, 60,);

    const plus = await svc.startNewGamePlus({
      playerId: "user-player",
      worldId: "world-1",
      previousPlaythroughId: started.id,
    },);

    expect(plus.difficulty,).toBe(PlusDifficulty.Hard,);
    expect(plus.metadata,).toMatchObject({
      isNewGamePlus: true,
      previousPlaythroughId: started.id,
    },);
  });

  test("getMetaProgression returns empty defaults for an unseen player", async () => {
    const meta = await svc.getMetaProgression("user-nobody",);

    expect(meta.totalPlaythroughs,).toBe(0,);
    expect(meta.endingsSeen,).toEqual([],);
    expect(meta.playerId,).toBe("user-nobody",);
  });
});
