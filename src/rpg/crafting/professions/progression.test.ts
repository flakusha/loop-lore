// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Profession progression ladder tests (pure functions; no DB, no ports, no
 * sleeps — parallel-safe).
 */
import { describe, expect, test, } from "bun:test";
import { ProfessionTitle, } from "../../../db/enums-crafting";
import {
  getProgression,
  LEVEL_XP,
  MAX_LEVEL,
  progressionBonuses,
  titleForLevel,
  xpForNextLevel,
} from "./progression";

// Resource contract: pure module — no filesystem, network, ports, or shared
// singletons touched; each test builds its own inputs.

describe("titleForLevel", () => {
  test("band boundaries", () => {
    expect(titleForLevel(1,),).toBe(ProfessionTitle.Apprentice,);
    expect(titleForLevel(25,),).toBe(ProfessionTitle.Apprentice,);
    expect(titleForLevel(26,),).toBe(ProfessionTitle.Journeyman,);
    expect(titleForLevel(50,),).toBe(ProfessionTitle.Journeyman,);
    expect(titleForLevel(51,),).toBe(ProfessionTitle.Expert,);
    expect(titleForLevel(75,),).toBe(ProfessionTitle.Expert,);
    expect(titleForLevel(76,),).toBe(ProfessionTitle.Master,);
    expect(titleForLevel(99,),).toBe(ProfessionTitle.Master,);
    expect(titleForLevel(100,),).toBe(ProfessionTitle.Grandmaster,);
  });

  test("rejects out-of-range and non-finite levels", () => {
    for (const level of [0, -1, 101, NaN, Infinity, 1.5,]) {
      expect(() => titleForLevel(level,)).toThrow();
    }
  });
});

describe("progressionBonuses", () => {
  test("epic ladder bonuses", () => {
    expect(progressionBonuses(1,),).toEqual({ success: 0, quality: 0, speed: 0, materialSaving: 0, },);
    expect(progressionBonuses(26,).success,).toBeCloseTo(0.05,);
    expect(progressionBonuses(51,).quality,).toBeCloseTo(0.10,);
    expect(progressionBonuses(76,).speed,).toBeCloseTo(0.15,);
    const gm = progressionBonuses(MAX_LEVEL,);
    for (const value of Object.values(gm,)) { expect(value,).toBeCloseTo(0.20,); }
  });

  test("rejects out-of-range levels", () => {
    expect(() => progressionBonuses(0,)).toThrow();
  });
});

describe("getProgression / xpForNextLevel", () => {
  test("snapshot fields", () => {
    const p26 = getProgression(26,);
    expect(p26.level,).toBe(26,);
    expect(p26.title,).toBe(ProfessionTitle.Journeyman,);
    expect(p26.nextTitleAt,).toBe(51,);
    expect(xpForNextLevel(26,),).toBe(LEVEL_XP,);
  });

  test("cap has no next threshold", () => {
    expect(getProgression(MAX_LEVEL,).nextTitleAt,).toBeNull();
    expect(xpForNextLevel(MAX_LEVEL,),).toBeNull();
  });
});
