// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battle Panel keyboard + command-dispatch tests, on the battle fake DOM.
 *
 * The focus cycle order is combatants (roster order) then actions
 * (attack/heal/end); the arrow keys move focus, Enter/Space trigger, Esc
 * clears. The panel keeps its focus index across mounts, so tests walk
 * relative to wherever the cycle currently sits instead of assuming a
 * starting slot.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import {
  actionButton,
  clearFocusLog,
  type FakeEl,
  installBattleDom,
  lastFocus,
  mountBattle,
  pressKey,
  tile,
  view,
} from "../tests/battle-fake-dom";
import { destroyBattlePanel, refreshBattle, renderBattle, } from "./panel";

let restoreDom: () => void;

beforeEach(() => {
  restoreDom = installBattleDom();
  clearFocusLog();
},);

afterEach(() => {
  destroyBattlePanel();
  restoreDom();
},);

/** Focus cycle slots in canonical order (alive combatants, then actions). */
const CYCLE = ["alice", "orc", "attack", "heal", "end",];

const nextOf = (slot: string,): string => CYCLE[(CYCLE.indexOf(slot,) + 1) % CYCLE.length]!;
const prevOf = (slot: string,): string => CYCLE[(CYCLE.indexOf(slot,) + CYCLE.length - 1) % CYCLE.length]!;

/** Which cycle slot (if any) currently holds focus. */
function focusSlot(): string {
  const el = lastFocus();
  return el?.dataset.battleId ?? el?.dataset.battleAction ?? "";
}

/** Arrow-right until the given slot holds focus. */
function advance(container: FakeEl, slot: string,): void {
  for (let i = 0; i <= CYCLE.length; i++) {
    if (focusSlot() === slot) { return; }
    pressKey(container, "ArrowRight",);
  }
  throw new Error(`focus never reached ${slot} (stuck on ${focusSlot()})`,);
}

describe("arrow key focus cycle", () => {
  it("walks combatants then actions and wraps at both ends", () => {
    const { container, } = mountBattle(view(),);
    const start = focusSlot();
    expect(CYCLE,).toContain(start,); // a mounted panel always focuses a slot
    expect(pressKey(container, "ArrowRight",),).toBe(true,);
    expect(focusSlot(),).toBe(nextOf(start,),);
    expect(pressKey(container, "ArrowLeft",),).toBe(true,);
    expect(focusSlot(),).toBe(start,);
    expect(pressKey(container, "ArrowLeft",),).toBe(true,); // wrap backwards
    expect(focusSlot(),).toBe(prevOf(start,),);
    expect(pressKey(container, "ArrowRight",),).toBe(true,); // and back again
    expect(focusSlot(),).toBe(start,);
  });

  it("uses ArrowUp and ArrowDown like ArrowLeft and ArrowRight", () => {
    const { container, } = mountBattle(view(),);
    const start = focusSlot();
    expect(pressKey(container, "ArrowDown",),).toBe(true,);
    expect(focusSlot(),).toBe(nextOf(start,),);
    expect(pressKey(container, "ArrowUp",),).toBe(true,);
    expect(focusSlot(),).toBe(start,);
  });

  it("drops dead combatants from the cycle", () => {
    const { container, } = mountBattle(view(),);
    advance(container, "orc",);
    renderBattle(view({
      combatants: [
        { id: "alice", name: "Alice", hp: 25, maxHp: 30, initiative: 18, },
        { id: "orc", name: "Orc Grunt", hp: 0, maxHp: 20, initiative: 5, },
      ],
    },),);
    expect(tile(container, "orc",).disabled,).toBe(true,);
    advance(container, "alice",);
    advance(container, "attack",);
    advance(container, "end",);
    pressKey(container, "ArrowRight",); // wraps over four slots, orc gone
    expect(focusSlot(),).toBe("alice",);
    expect(focusSlot(),).not.toBe("orc",);
  });
});

describe("enter and space activation", () => {
  it("Enter toggles selection of the focused combatant", () => {
    const { container, } = mountBattle(view(),);
    advance(container, "orc",);
    pressKey(container, "Enter",);
    expect(tile(container, "orc",).classList.contains("is-selected",),).toBe(true,);
    pressKey(container, " ",);
    expect(tile(container, "orc",).classList.contains("is-selected",),).toBe(false,);
  });

  it("Enter executes the focused action with the selected target", () => {
    const { container, sent, } = mountBattle(view(),);
    tile(container, "alice",).click(); // select a target first
    advance(container, "attack",);
    pressKey(container, "Enter",);
    expect(sent,).toEqual(["/attack Alice",],);
  });

  it("clicking an action button executes it through the mouse path", () => {
    const { container, sent, } = mountBattle(view(),);
    tile(container, "alice",).click();
    actionButton(container, "attack",).click();
    expect(sent,).toEqual(["/attack Alice",],);
    actionButton(container, "end",).click();
    expect(sent,).toEqual(["/attack Alice", "/battle end",],);
  });

  it("Space on the focused attack without a selection sends nothing", () => {
    const { container, sent, } = mountBattle(view(),);
    advance(container, "attack",);
    pressKey(container, " ",);
    expect(sent,).toEqual([],);
  });

  it("the end action always sends /battle end", () => {
    const { container, sent, } = mountBattle(view(),);
    advance(container, "end",);
    pressKey(container, "Enter",);
    expect(sent,).toEqual(["/battle end",],);
  });
});

describe("focus preservation", () => {
  it("keeps the focused slot across re-renders", () => {
    const { container, } = mountBattle(view(),);
    advance(container, "heal",);
    const focusedBefore = lastFocus();
    tile(container, "alice",).click(); // re-render replaces every node
    expect(focusSlot(),).toBe("heal",);
    expect(lastFocus(),).not.toBe(focusedBefore,);
    refreshBattle();
    expect(focusSlot(),).toBe("heal",);
  });

  it("forces no focus and accepts no keys when the battle is not active", () => {
    const { container, sent, } = mountBattle(view({ status: "ended", },),);
    expect(lastFocus(),).toBeNull();
    for (const key of ["Escape", "ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Enter", " ",]) {
      pressKey(container, key,);
    }
    expect(sent,).toEqual([],);
  });
});
