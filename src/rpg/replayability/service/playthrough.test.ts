// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Playthrough service tests: run numbering, row mapping, listing/counting,
 * choice tallying, and secret recording (including the optimistic-lock
 * concurrent-modification guard).
 *
 * Resource contract: every test runs against its own fresh in-memory SQLite
 * DB (`createTestDb` in `beforeEach`, destroyed in `afterEach`); the player
 * and world rows are re-seeded per test, so nothing depends on ordering or
 * on another test's writes. No fs paths, no ports.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, destroyTestDb, type TestDb, } from "../../../test-utils/create-test-db";
import { insertPlaythroughs, insertUsers, insertWorlds, } from "../../../test-utils/insert-helpers";
import {
  getPlayerPlaythroughs,
  getPlaythrough,
  getPlaythroughCount,
  recordChoice,
  recordSecretFound,
  rowToPlaythrough,
  startPlaythrough,
} from "./playthrough";
import { EndingType, PlusDifficulty, } from "./types";

createLogger({ level: "error", },);

let fixture: TestDb;
let db: Kysely<DB>;

beforeEach(async () => {
  fixture = await createTestDb();
  db = fixture.db;
  await insertUsers(db, "player", "Player", { id: "user-1", },);
  await insertWorlds(db, "user-1", "World", { id: "world-1", },);
},);

afterEach(async () => {
  await destroyTestDb(fixture,);
},);

describe("startPlaythrough", () => {
  test("numbers the first run 1 with documented defaults", async () => {
    const out = await startPlaythrough(db, { playerId: "user-1", worldId: "world-1", },);

    expect(out.playthroughNumber,).toBe(1,);
    expect(out.difficulty,).toBe(PlusDifficulty.Normal,);
    expect(out.status,).toBe("active",);
    expect(out.isCompleted,).toBe(false,);
    expect(out.choicesMade,).toBe(0,);
    expect(out.secretsFound,).toBe(0,);
    expect(out.achievementsUnlocked,).toBe(0,);
    expect(out.completionTime,).toBe(0,);
    expect(out.endingId,).toBeNull();
    expect(out.endingType,).toBeNull();
    expect(out.completedAt,).toBeNull();
    expect(out.metadata,).toEqual({},);

    const persisted = await getPlaythrough(db, out.id,);
    expect(persisted,).not.toBeNull();
    expect(persisted!.playthroughNumber,).toBe(1,);
  });

  test("increments numbering per player+world and restarts in a new world", async () => {
    const first = await startPlaythrough(db, { playerId: "user-1", worldId: "world-1", },);
    const second = await startPlaythrough(db, { playerId: "user-1", worldId: "world-1", },);

    expect(first.playthroughNumber,).toBe(1,);
    expect(second.playthroughNumber,).toBe(2,);

    await insertWorlds(db, "user-1", "Other World", { id: "world-2", },);
    const freshWorld = await startPlaythrough(db, { playerId: "user-1", worldId: "world-2", },);
    expect(freshWorld.playthroughNumber,).toBe(1,);
  });

  test("honors explicit difficulty and persists metadata", async () => {
    const out = await startPlaythrough(db, {
      playerId: "user-1",
      worldId: "world-1",
      difficulty: PlusDifficulty.Nightmare,
      metadata: { theme: "undead", },
    },);

    expect(out.difficulty,).toBe(PlusDifficulty.Nightmare,);
    expect(out.metadata,).toEqual({ theme: "undead", },);
    expect((await getPlaythrough(db, out.id,))!.metadata,).toEqual({ theme: "undead", },);
  });
});

describe("getPlaythrough", () => {
  test("returns null for an unknown id", async () => {
    expect(await getPlaythrough(db, "missing-run",),).toBeNull();
  });

  test("maps every persisted column onto the Playthrough shape", async () => {
    await insertPlaythroughs(db, "user-1", "world-1", {
      id: "run-1",
      playthrough_number: 3,
      difficulty: PlusDifficulty.Hard,
      status: "completed",
      ending_id: "ending-1",
      ending_type: EndingType.Bad,
      completion_time: 5400,
      choices_made: 12,
      secrets_found: 4,
      achievements_unlocked: 2,
      metadata: JSON.stringify({ theme: "undead", },),
      completed_at: "2026-01-01T00:00:00.000Z",
    },);

    const out = await getPlaythrough(db, "run-1",);

    expect(out,).not.toBeNull();
    expect(out!.id,).toBe("run-1",);
    expect(out!.playerId,).toBe("user-1",);
    expect(out!.worldId,).toBe("world-1",);
    expect(out!.playthroughNumber,).toBe(3,);
    expect(out!.difficulty,).toBe(PlusDifficulty.Hard,);
    expect(out!.status,).toBe("completed",);
    expect(out!.isCompleted,).toBe(true,);
    expect(out!.endingId,).toBe("ending-1",);
    expect(out!.endingType,).toBe(EndingType.Bad,);
    expect(out!.completionTime,).toBe(5400,);
    expect(out!.choicesMade,).toBe(12,);
    expect(out!.secretsFound,).toBe(4,);
    expect(out!.achievementsUnlocked,).toBe(2,);
    expect(out!.metadata,).toEqual({ theme: "undead", },);
    expect(out!.completedAt,).toBe("2026-01-01T00:00:00.000Z",);
    expect(typeof out!.createdAt,).toBe("string",);
    expect(typeof out!.updatedAt,).toBe("string",);
  });
});

describe("rowToPlaythrough", () => {
  const row = {
    id: "r",
    player_id: "p",
    world_id: "w",
    playthrough_number: 1,
    difficulty: "normal",
    status: "active",
    ending_id: null,
    ending_type: null,
    completion_time: 0,
    choices_made: 0,
    secrets_found: 0,
    achievements_unlocked: 0,
    metadata: "{}",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    completed_at: null,
  };

  test("derives isCompleted only from the completed status", () => {
    expect(rowToPlaythrough(row,).isCompleted,).toBe(false,);
    expect(rowToPlaythrough({ ...row, status: "completed", },).isCompleted,).toBe(true,);
  });

  test("falls back to an empty metadata object on junk or missing JSON", () => {
    expect(rowToPlaythrough({ ...row, metadata: "not json", },).metadata,).toEqual({},);
    expect(rowToPlaythrough({ ...row, metadata: null, },).metadata,).toEqual({},);
  });
});

describe("getPlayerPlaythroughs + getPlaythroughCount", () => {
  test("orders by playthrough_number desc and filters by world", async () => {
    await insertWorlds(db, "user-1", "Other World", { id: "world-2", },);
    await insertPlaythroughs(db, "user-1", "world-1", { id: "run-1", playthrough_number: 1, },);
    await insertPlaythroughs(db, "user-1", "world-1", { id: "run-2", playthrough_number: 3, },);
    await insertPlaythroughs(db, "user-1", "world-2", { id: "run-3", playthrough_number: 2, },);

    const all = await getPlayerPlaythroughs(db, "user-1",);
    expect(all.map((p,) => p.id),).toEqual(["run-2", "run-3", "run-1",],);

    const worldOne = await getPlayerPlaythroughs(db, "user-1", "world-1",);
    expect(worldOne.map((p,) => p.id),).toEqual(["run-2", "run-1",],);

    expect(await getPlayerPlaythroughs(db, "user-2",),).toEqual([],);
    expect(await getPlaythroughCount(db, "user-1", "world-1",),).toBe(2,);
    expect(await getPlaythroughCount(db, "user-1", "world-2",),).toBe(1,);
    expect(await getPlaythroughCount(db, "user-2", "world-1",),).toBe(0,);
  });
});

describe("recordChoice", () => {
  test("increments choices_made cumulatively", async () => {
    await insertPlaythroughs(db, "user-1", "world-1", { id: "run-1", choices_made: 0, },);

    await recordChoice(db, "run-1",);
    expect((await getPlaythrough(db, "run-1",))!.choicesMade,).toBe(1,);

    await recordChoice(db, "run-1",);
    expect((await getPlaythrough(db, "run-1",))!.choicesMade,).toBe(2,);
  });
});

describe("recordSecretFound", () => {
  test("records the first secret and preserves sibling metadata keys", async () => {
    await insertPlaythroughs(db, "user-1", "world-1", {
      id: "run-1",
      metadata: JSON.stringify({ theme: "undead", },),
    },);

    await recordSecretFound(db, "run-1", "secret-a",);

    const out = await getPlaythrough(db, "run-1",);
    expect(out!.secretsFound,).toBe(1,);
    expect(out!.metadata,).toEqual({ theme: "undead", secrets: ["secret-a",], },);
  });

  test("recording the same secret twice stays idempotent", async () => {
    await insertPlaythroughs(db, "user-1", "world-1", { id: "run-1", },);

    await recordSecretFound(db, "run-1", "secret-a",);
    await recordSecretFound(db, "run-1", "secret-a",);

    const out = await getPlaythrough(db, "run-1",);
    expect(out!.secretsFound,).toBe(1,);
    expect(out!.metadata.secrets,).toEqual(["secret-a",],);
  });

  test("appends distinct secrets while keeping earlier ones", async () => {
    await insertPlaythroughs(db, "user-1", "world-1", { id: "run-1", },);

    await recordSecretFound(db, "run-1", "secret-a",);
    await recordSecretFound(db, "run-1", "secret-b",);

    const out = await getPlaythrough(db, "run-1",);
    expect(out!.secretsFound,).toBe(2,);
    expect(out!.metadata.secrets,).toEqual(["secret-a", "secret-b",],);
  });

  test("rejects an unknown playthrough", async () => {
    await expect(recordSecretFound(db, "missing-run", "secret-a",),).rejects.toThrow(
      "Playthrough not found",
    );
  });

  test("optimistic lock lets exactly one of two racing writes win", async () => {
    await insertPlaythroughs(db, "user-1", "world-1", { id: "run-1", },);

    // Both writers read the same updated_at, then race the update; the
    // single SQLite connection serializes them, so the second one's
    // `where updated_at = read` matches zero rows and must throw.
    const settled = await Promise.allSettled([
      recordSecretFound(db, "run-1", "secret-a",),
      recordSecretFound(db, "run-1", "secret-b",),
    ],);

    const rejected = settled.filter((s,) => s.status === "rejected");
    expect(rejected,).toHaveLength(1,);
    const reason = (rejected[0] as PromiseRejectedResult).reason;
    expect(reason,).toBeInstanceOf(Error,);
    expect(reason.message,).toBe("Playthrough run-1 was modified concurrently",);

    // The winning write persisted exactly one secret.
    const out = await getPlaythrough(db, "run-1",);
    expect(out!.secretsFound,).toBe(1,);
    expect(out!.metadata.secrets,).toHaveLength(1,);
  });
});
