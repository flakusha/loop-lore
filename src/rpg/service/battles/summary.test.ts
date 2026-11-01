// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import { buildBattleSummary, } from "./summary.js";
import type { BattleWithRoster, } from "./types.js";
import { BattleStatus, } from "./types.js";

function battle(overrides: Partial<BattleWithRoster> = {},): BattleWithRoster {
  return {
    id: "b1",
    chatId: "c1",
    worldId: null,
    status: BattleStatus.Completed,
    round: 3,
    turnIndex: 0,
    combatants: [
      { id: "a", name: "Alice", hp: 20, maxHp: 20, isNpc: false, } as never,
      { id: "o", name: "Orc", hp: 0, maxHp: 20, isNpc: true, } as never,
    ],
    log: [],
    createdBy: "u1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    endedAt: null,
    ...overrides,
  };
}

describe("buildBattleSummary", () => {
  it("declares party victory with survivors and fallen", () => {
    const s = buildBattleSummary(battle(), "player",);
    expect(s.over,).toBe(true,);
    expect(s.survivors,).toEqual(["Alice",],);
    expect(s.fallen,).toEqual(["Orc",],);
    expect(s.lines[0],).toContain("party win",);
  });

  it("renders abandoned battles without a victor", () => {
    const s = buildBattleSummary(battle({ status: BattleStatus.Abandoned, },), null,);
    expect(s.lines[0],).toBe("**Battle ended.**",);
  });
});
