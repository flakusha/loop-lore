// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { makeInitiativeRoll, } from "./initiative.ts";

describe("makeInitiativeRoll", () => {
  test("initiative equals the roll total with dexterity applied", () => {
    const { roll, initiative, } = makeInitiativeRoll(5,);
    expect(initiative,).toBe(roll.total,);
    expect(roll.type,).toBe("d20",);
    expect(roll.count,).toBe(1,);
    expect(roll.modifiers,).toContainEqual({ source: "initiative", value: 5, type: "bonus", },);
  });

  test("roll total stays within d20 plus dexterity bounds", () => {
    for (let i = 0; i < 50; i++) {
      const { roll, initiative, } = makeInitiativeRoll(3,);
      expect(roll.total,).toBeGreaterThanOrEqual(4,);
      expect(roll.total,).toBeLessThanOrEqual(23,);
      expect(initiative,).toBe(roll.total,);
    }
  });

  test("extra modifiers are forwarded to the roll", () => {
    const extra = { source: "haste", value: 2, type: "bonus" as const, };
    const { roll, } = makeInitiativeRoll(4, [extra,],);
    expect(roll.modifiers,).toContainEqual(extra,);
    expect(roll.total,).toBeGreaterThanOrEqual(7,);
    expect(roll.total,).toBeLessThanOrEqual(26,);
  });

  test("zero dexterity still yields a valid 1-20 initiative", () => {
    const { initiative, } = makeInitiativeRoll(0,);
    expect(initiative,).toBeGreaterThanOrEqual(1,);
    expect(initiative,).toBeLessThanOrEqual(20,);
  });
});
