// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pure battle-command helpers: `enabledActionSlots` (the bar-order slot map
 * the 1-9 keynav handlers consume) and `battleAnnouncement` (the panel's
 * aria-live text). No DOM needed — the functions are pure over `BattleView`.
 */
import { describe, expect, it, } from "bun:test";
import {
  battleAnnouncement,
  type BattleView,
  enabledActionSlots,
} from "./commands";

function battle(overrides: Partial<BattleView> = {},): BattleView {
  return {
    id: "b1",
    status: "active",
    round: 3,
    turnIndex: 0,
    combatants: [
      { id: "c1", name: "Aria", hp: 10, maxHp: 20, initiative: 2, },
      { id: "c2", name: "Ogre", hp: 30, maxHp: 30, initiative: 1, },
    ],
    items: [],
    ...overrides,
  };
}

describe("enabledActionSlots", () => {
  it("maps the full bar with an active battle, target, and items", () => {
    const slots = enabledActionSlots(battle({ items: [{ id: "i1", name: "Potion", quantity: 2, },], },), "c2",);
    expect(slots,).toStrictEqual([
      "attack",
      "heal",
      "end",
      "item",
      "social-intimidate",
      "social-taunt",
      "social-negotiate",
      "social-surrender",
    ],);
  });

  it("drops targeted actions without a target and item with an empty list", () => {
    const slots = enabledActionSlots(battle(), null,);
    expect(slots,).toStrictEqual(["end",],);
  });

  it("keeps only the end escape hatch outside an active battle", () => {
    const slots = enabledActionSlots(
      battle({ status: "ended", items: [{ id: "i1", name: "Potion", quantity: 1, },], },),
      "c2",
    );

    expect(slots,).toStrictEqual(["end",],);
  });
});

describe("battleAnnouncement", () => {
  it("is empty without a mounted battle", () => {
    expect(battleAnnouncement(null,),).toBe("",);
  });

  it("names the non-active status", () => {
    expect(battleAnnouncement(battle({ status: "ended", },),),).toBe("Battle ended",);
  });

  it("announces round and acting combatant", () => {
    expect(battleAnnouncement(battle(),),).toBe("Round 3: Aria's turn",);
  });

  it("falls back when turnIndex points past the roster", () => {
    expect(battleAnnouncement(battle({ turnIndex: 9, },),),).toBe("Round 3: no active combatant",);
  });
});
