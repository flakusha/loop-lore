// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the achievement reward applicator and the claimRewards /
 * updateProgress / getPlayerStats paths it sits behind.
 *
 * Focus: the newly-added `story_points` reward branch plus the
 * validation errors in `progress.ts` (so the diff-scoped coverage
 * gate clears on both files).
 *
 * `reward-apply.ts` imports `earnStoryPoints` from the story-points
 * barrel; we stub that module so we don't depend on the real earn
 * pipeline and can assert call shape (actorId, worldId=null, amount,
 * reason). With `--isolate` (per-file module isolation) the stub only
 * affects this file's view of the barrel.
 */
import type { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, mock, test, } from "bun:test";
import { Kysely, } from "kysely";
import type { DB, } from "../../../db";
import { createInMemoryDb, } from "../../../services/agency/__helpers/in-mem-db";
import { insertAchievements, insertPlayerAchievements, } from "../../../test-utils/insert-helpers";
import {
  claimRewards,
  getPlayerStats,
  updateProgress,
} from "./progress";
import {
  applySingleAchievementReward,
} from "./reward-apply";
import type { AchievementReward, } from "./types";

const earnMock = mock(async (..._args: unknown[]) => ({ ok: true, }));
const earnModule = { earnStoryPoints: earnMock, };

mock.module("../../../services/agency/story-points", () => earnModule,);

beforeEach(() => {
  earnMock.mockReset();
  earnMock.mockResolvedValue({ ok: true, },);
},);

let db: Kysely<DB>;
let raw: Database;

afterEach(() => {
  raw?.close();
},);

async function setup(): Promise<void> {
  const result = await createInMemoryDb();
  db = result.db;
  raw = result.raw;
}

/**
 * Insert the FK-referenced `users` row that `player_achievements.player_id`
 * points to. `username` is unique — caller-provided unique suffix.
 */
async function makeUser(playerId: string,): Promise<void> {
  await db
    .insertInto("users",)
    .values({
      id: playerId,
      username: `user-${playerId}`,
      display_name: `Test ${playerId}`,
      password_hash: null,
    },)
    .execute();
}

async function makeAchievement(
  rewards: AchievementReward[],
  opts: { maxProgress?: number } = {},
): Promise<string> {
  return await insertAchievements(
    db,
    "Test Achievement",
    "desc",
    "story",
    "bronze",
    {
      unlock_condition: JSON.stringify({ type: "counter", target: "wins", count: opts.maxProgress ?? 1, },),
      rewards: JSON.stringify(rewards,),
    },
  );
}

async function makeUnlocked(achievementId: string, playerId: string,): Promise<void> {
  await makeUser(playerId,);
  await insertPlayerAchievements(db, playerId, achievementId, {
    progress: 1,
    max_progress: 1,
    status: "unlocked",
    unlocked_at: new Date().toISOString(),
    claimed_at: null,
  },);
}

describe("applySingleAchievementReward — story_points branch", () => {
  test("credits story_points and returns true", async () => {
    await setup();
    const result = await applySingleAchievementReward(
      { type: "story_points", value: 7, description: "+7 SP", },
      { db, playerId: "p1", achievementId: "ach-1", },
    );
    expect(result,).toBe(true,);
    expect(earnMock,).toHaveBeenCalledTimes(1,);
    expect(earnMock.mock.calls[0]?.[0],).toBe(db,);
    expect(earnMock.mock.calls[0]?.[1],).toEqual({
      actorId: "p1",
      worldId: null,
      amount: 7,
      reason: "achievement:ach-1",
    },);
  });

  test("floors non-integer values via Math.floor before passing through", async () => {
    await setup();
    const result = await applySingleAchievementReward(
      { type: "story_points", value: 3.9, description: "+3 SP", },
      { db, playerId: "p1", achievementId: "ach-1", },
    );
    expect(result,).toBe(true,);
    expect(earnMock.mock.calls[0]?.[1],).toMatchObject({ amount: 3, },);
  });

  test("rejects non-positive numeric values and returns false", async () => {
    await setup();
    expect(
      await applySingleAchievementReward(
        { type: "story_points", value: 0, description: "x", },
        { db, playerId: "p1", achievementId: "ach-1", },
      ),
    ).toBe(false,);
    expect(
      await applySingleAchievementReward(
        { type: "story_points", value: -5, description: "x", },
        { db, playerId: "p1", achievementId: "ach-1", },
      ),
    ).toBe(false,);
    expect(
      await applySingleAchievementReward(
        { type: "story_points", value: Number.NaN, description: "x", },
        { db, playerId: "p1", achievementId: "ach-1", },
      ),
    ).toBe(false,);
    expect(earnMock,).not.toHaveBeenCalled();
  });

  test("returns false and warns when earnStoryPoints throws", async () => {
    await setup();
    earnMock.mockRejectedValueOnce(new Error("boom",),);
    const result = await applySingleAchievementReward(
      { type: "story_points", value: 5, description: "+5 SP", },
      { db, playerId: "p1", achievementId: "ach-1", },
    );
    expect(result,).toBe(false,);
    expect(earnMock,).toHaveBeenCalledTimes(1,);
  });
});

describe("applySingleAchievementReward — unsupported reward types", () => {
  test.each(["experience", "item", "currency", "title", "cosmetic", "unlock",] as const,)(
    "returns false for reward type %s without calling earnStoryPoints",
    async (type,) => {
      await setup();
      const result = await applySingleAchievementReward(
        { type, value: 1, description: "noop", },
        { db, playerId: "p1", achievementId: "ach-1", },
      );
      expect(result,).toBe(false,);
      expect(earnMock,).not.toHaveBeenCalled();
    },
  );
});

describe("claimRewards — story_points reward dispatch", () => {
  test("awards story_points and marks the player achievement claimed", async () => {
    await setup();

    const achievementId = await makeAchievement(
      [{ type: "story_points", value: 10, description: "+10 SP", },],
    );
    await makeUnlocked(achievementId, "player-1",);

    const rewards = await claimRewards(db, "player-1", achievementId,);
    expect(rewards,).toHaveLength(1,);
    expect(rewards[0]?.type,).toBe("story_points",);
    expect(earnMock,).toHaveBeenCalledTimes(1,);
    expect(earnMock.mock.calls[0]?.[1],).toMatchObject({
      actorId: "player-1",
      worldId: null,
      amount: 10,
      reason: `achievement:${achievementId}`,
    },);

    const row = raw
      .query("SELECT status, claimed_at FROM player_achievements WHERE player_id = ? AND achievement_id = ?",)
      .get("player-1", achievementId,) as { status: string; claimed_at: string | null };
    expect(row.status,).toBe("claimed",);
    expect(row.claimed_at,).not.toBeNull();
  });

  test("dispatches every reward in order when an achievement grants mixed rewards", async () => {
    await setup();

    const achievementId = await makeAchievement(
      [
        { type: "experience", value: 100, description: "+100 XP", },
        { type: "story_points", value: 4, description: "+4 SP", },
        { type: "title", value: "hero", description: "Title: Hero", },
      ],
    );
    await makeUnlocked(achievementId, "player-1",);

    const rewards = await claimRewards(db, "player-1", achievementId,);
    expect(rewards,).toHaveLength(3,);
    // Only the story_points reward is wired — earnMock is called once.
    expect(earnMock,).toHaveBeenCalledTimes(1,);
    expect(earnMock.mock.calls[0]?.[1],).toMatchObject({
      actorId: "player-1",
      amount: 4,
      reason: `achievement:${achievementId}`,
    },);
  });

  test("claimRewards validation errors", async () => {
    await setup();

    const achievementId = await makeAchievement(
      [{ type: "story_points", value: 5, description: "+5 SP", },],
    );

    // No player_achievement row → "Player achievement not found".
    await makeUser("ghost-player",);
    await expect(claimRewards(db, "ghost-player", achievementId,),).rejects.toThrow(
      "Player achievement not found",
    );
    expect(earnMock,).not.toHaveBeenCalled();

    // Locked row → "Achievement not unlocked".
    await makeUser("locked-player",);
    await insertPlayerAchievements(db, "locked-player", achievementId, {
      progress: 0,
      max_progress: 1,
      status: "locked",
    },);
    await expect(claimRewards(db, "locked-player", achievementId,),).rejects.toThrow(
      "Achievement not unlocked",
    );
    expect(earnMock,).not.toHaveBeenCalled();

    // Already-claimed row → "Rewards already claimed".
    await makeUnlocked(achievementId, "claimed-player",);
    // Reset the earn-call counter so we can assert that the second (rejected)
    // claimRewards does not re-invoke earnStoryPoints.
    earnMock.mockReset();
    earnMock.mockResolvedValue({ ok: true, },);
    await claimRewards(db, "claimed-player", achievementId,);
    earnMock.mockReset();
    earnMock.mockResolvedValue({ ok: true, },);
    await expect(claimRewards(db, "claimed-player", achievementId,),).rejects.toThrow(
      "Rewards already claimed",
    );
    expect(earnMock,).not.toHaveBeenCalled();
  });
});

describe("updateProgress — validation and lifecycle branches", () => {
  test("throws when the achievement definition is missing", async () => {
    await setup();
    await makeUser("update-no-ach",);
    await expect(updateProgress(db, "update-no-ach", "ghost-achievement",),).rejects.toThrow(
      "Achievement not found",
    );
  });

  test("creates a locked row on first progress, then unlocks when threshold reached", async () => {
    await setup();

    await makeUser("updater-1",);

    const achievementId = await makeAchievement(
      [{ type: "story_points", value: 5, description: "+5 SP", },],
      { maxProgress: 3, },
    );

    // First call creates the row at 0/3 and increments to 1.
    const r1 = await updateProgress(db, "updater-1", achievementId,);
    expect(r1.unlocked,).toBe(false,);
    expect(r1.oldProgress,).toBe(0,);
    expect(r1.newProgress,).toBe(1,);
    expect(r1.rewards,).toEqual([],);

    // Drive past the threshold — awards unlock + returns reward list.
    const r3 = await updateProgress(db, "updater-1", achievementId, 2,);
    expect(r3.unlocked,).toBe(true,);
    expect(r3.newProgress,).toBe(3,);
    expect(r3.rewards,).toEqual([{ type: "story_points", value: 5, description: "+5 SP", },],);

    // Subsequent updates on an already-unlocked row short-circuit.
    const rAfter = await updateProgress(db, "updater-1", achievementId,);
    expect(rAfter.unlocked,).toBe(false,);
    expect(rAfter.rewards,).toEqual([],);
  });
});

describe("getPlayerStats", () => {
  test("aggregates unlocked counts per category and tier", async () => {
    await setup();

    // stats query is per-player — one user, multiple achievements.
    await makeUser("stats-1",);

    const story = await makeAchievement(
      [{ type: "story_points", value: 1, description: "+1 SP", },],
      { maxProgress: 1, },
    );
    const combat = await insertAchievements(db, "Combat Win", "x", "combat", "silver", {
      unlock_condition: JSON.stringify({ type: "simple", },),
      rewards: JSON.stringify([{ type: "experience", value: 10, description: "+10 XP", },],),
    },);
    const craft = await insertAchievements(db, "Craft Master", "x", "crafting", "gold", {
      unlock_condition: JSON.stringify({ type: "simple", },),
      rewards: JSON.stringify([],),
    },);

    // Two unlocked, one locked for stats-1.
    await insertPlayerAchievements(db, "stats-1", story, {
      progress: 1,
      max_progress: 1,
      status: "unlocked",
      unlocked_at: new Date().toISOString(),
    },);
    await insertPlayerAchievements(db, "stats-1", combat, {
      progress: 1,
      max_progress: 1,
      status: "claimed",
      unlocked_at: new Date().toISOString(),
      claimed_at: new Date().toISOString(),
    },);
    await insertPlayerAchievements(db, "stats-1", craft, {
      progress: 0,
      max_progress: 1,
      status: "locked",
    },);

    const stats = await getPlayerStats(db, "stats-1",);
    expect(stats.totalUnlocked,).toBe(2,);
    expect(stats.totalAvailable,).toBeGreaterThanOrEqual(3,);
    expect(stats.byCategory.story,).toBe(1,);
    expect(stats.byCategory.combat,).toBe(1,);
    expect(stats.byTier.bronze,).toBe(1,);
    expect(stats.byTier.silver,).toBe(1,);
  });
});
