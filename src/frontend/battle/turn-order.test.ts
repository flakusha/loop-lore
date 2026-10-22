// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Turn-order strip tests: the acting-first queue derivation
 * (`turnQueue` — wrap-around, dead flags, empty roster) and the rendered
 * DOM contract (label, acting chip with `aria-current`, per-chip text).
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { type FakeEl, installBattleDom, } from "../tests/battle-fake-dom";
import { view, } from "../tests/battle-fake-mount";
import { renderTurnOrder, turnQueue, } from "./turn-order";

let restoreDom: () => void;

beforeEach(() => {
  restoreDom = installBattleDom();
  // Seed the alpine i18n catalog the strip resolves its label from.
  (globalThis as { __localeStrings?: unknown }).__localeStrings = {
    battle: { turnOrder: "Turn order", },
  };
},);

afterEach(() => {
  (globalThis as { __localeStrings?: unknown }).__localeStrings = undefined;
  restoreDom();
},);

describe("turnQueue", () => {
  it("puts the acting combatant first, then the initiative order", () => {
    const queue = turnQueue(view({ turnIndex: 0, },),);
    expect(queue.map((e,) => e.name),).toEqual(["Alice", "Orc Grunt",],);
    expect(queue[0],).toMatchObject({ acting: true, dead: false, },);
    expect(queue[1],).toMatchObject({ acting: false, dead: false, },);
  });

  it("wraps around the roster when the turn is mid-order", () => {
    const queue = turnQueue(view({ turnIndex: 1, },),);
    expect(queue.map((e,) => e.name),).toEqual(["Orc Grunt", "Alice",],);
  });

  it("carries initiative values for display", () => {
    const queue = turnQueue(view({ turnIndex: 0, },),);
    expect(queue.map((e,) => e.initiative),).toEqual([18, 5,],);
  });

  it("flags downed combatants", () => {
    const withDead = view({
      combatants: [
        { id: "alice", name: "Alice", hp: 25, maxHp: 30, initiative: 18, },
        { id: "ghost", name: "Ghost", hp: 0, maxHp: 10, initiative: 9, },
      ],
    },);

    expect(turnQueue(withDead,).map((e,) => e.dead),).toEqual([false, true,],);
  });

  it("returns an empty queue for an empty roster", () => {
    expect(turnQueue(view({ combatants: [], },),),).toEqual([],);
  });

  it("normalizes an out-of-range turnIndex instead of crashing", () => {
    const negative = turnQueue(view({ turnIndex: -1, },),);
    expect(negative.map((e,) => e.name),).toEqual(["Orc Grunt", "Alice",],);
    const overflow = turnQueue(view({ turnIndex: 5, },),);
    expect(overflow.map((e,) => e.name),).toEqual(["Orc Grunt", "Alice",],);
  });
});

describe("renderTurnOrder", () => {
  it("renders the i18n label and an acting-first chip per combatant", () => {
    const el = renderTurnOrder(view({ turnIndex: 0, },),) as unknown as FakeEl;
    expect(el.className,).toBe("battle-turn-order",);
    expect(el.getAttribute("aria-label",),).toBe("Turn order",);
    expect(el.getAttribute("role",),).toBe("group",);

    const label = el.children[0]!;
    expect(label.className,).toBe("battle-turn-order-label",);
    expect(label.textContent,).toBe("Turn order",);

    const queue = el.children[1]!;
    expect(queue.className,).toBe("battle-turn-queue",);
    expect(queue.getAttribute("role",),).toBe("list",);
    expect(queue.children.map((c,) => c.textContent),).toEqual([
      "➤ Alice · 18",
      "Orc Grunt · 5",
    ],);
  });

  it("marks the acting chip with aria-current and is-acting", () => {
    const queue = renderTurnOrder(view({ turnIndex: 1, },),).children[1]!;
    expect(queue.children[0]!.className,).toBe("battle-turn-entry is-acting",);
    expect(queue.children[0]!.getAttribute("aria-current",),).toBe("true",);
    expect(queue.children[1]!.className,).toBe("battle-turn-entry",);
    expect(queue.children[1]!.getAttribute("aria-current",),).toBeNull();
  });

  it("marks downed combatant chips with is-dead", () => {
    const withDead = view({
      combatants: [
        { id: "alice", name: "Alice", hp: 25, maxHp: 30, initiative: 18, },
        { id: "ghost", name: "Ghost", hp: 0, maxHp: 10, initiative: 9, },
      ],
    },);

    const queue = renderTurnOrder(withDead,).children[1]!;
    expect(queue.children[1]!.className,).toBe("battle-turn-entry is-dead",);
  });
});
