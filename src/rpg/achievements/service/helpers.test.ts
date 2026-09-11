// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for achievement row mappers (pure, no DB). */
import { describe, expect, test, } from "bun:test";
import { createLogger, } from "../../../logger";
import { getLog, rowToAchievement, rowToPlayerAchievement, } from "./helpers";

createLogger({ level: "error", },);

describe("getLog", () => {
  test("returns the achievements logger", () => {
    expect(getLog(),).toBeDefined();
  });
});

describe("rowToAchievement", () => {
  test("maps snake_case columns and parses JSON fields", () => {
    const out = rowToAchievement({
      id: "a1",
      name: "First Blood",
      description: "Win a fight",
      category: "combat",
      tier: 1,
      icon: "sword",
      is_secret: false,
      is_hidden: true,
      unlock_condition: JSON.stringify({ type: "counter", target: "wins", count: 1, },),
      rewards: JSON.stringify([{ type: "experience", value: 100, description: "+100 XP", },],),
      metadata: JSON.stringify({ origin: "core", },),
      created_at: "2026-01-01",
      updated_at: "2026-01-02",
    },);
    expect(out.id,).toBe("a1",);
    expect(out.isSecret,).toBe(false,);
    expect(out.isHidden,).toBe(true,);
    expect(out.unlockCondition,).toEqual({ type: "counter", target: "wins", count: 1, },);
    expect(out.rewards,).toEqual([{ type: "experience", value: 100, description: "+100 XP", },],);
    expect(out.metadata,).toEqual({ origin: "core", },);
    expect(out.createdAt,).toBe("2026-01-01",);
  });

  test("corrupt JSON falls back to defaults", () => {
    const out = rowToAchievement({
      id: "a2",
      unlock_condition: "{{{nope",
      rewards: null,
      metadata: undefined,
    },);
    expect(out.unlockCondition,).toEqual({ type: "simple", },);
    expect(out.rewards,).toEqual([],);
    expect(out.metadata,).toEqual({},);
  });
});

describe("rowToPlayerAchievement", () => {
  test("derives isUnlocked from status", () => {
    const base = {
      id: "pa1",
      player_id: "user-1",
      achievement_id: "a1",
      progress: 1,
      max_progress: 1,
      unlocked_at: "2026-01-01",
      claimed_at: null,
      metadata: null,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    };
    expect(rowToPlayerAchievement({ ...base, status: "unlocked", },).isUnlocked,).toBe(true,);
    expect(rowToPlayerAchievement({ ...base, status: "claimed", },).isUnlocked,).toBe(true,);
    expect(rowToPlayerAchievement({ ...base, status: "locked", },).isUnlocked,).toBe(false,);
  });
});
