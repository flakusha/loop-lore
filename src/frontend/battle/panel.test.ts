// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battle Panel tests: command mapping + mounted rendering behavior.
 *
 * `battleCommandFor` is the panel's observable command contract (a click or
 * keyboard trigger resolves to exactly one slash command). The mounted tests
 * run the panel on the battle fake DOM: empty-state hint, roster state
 * classes/aria, selection toggling, and destroy semantics. Keyboard cycling
 * and command dispatch live in panel-actions.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import {
  clearFocusLog,
  installBattleDom,
  lastFocus,
  pressKey,
} from "../tests/battle-fake-dom";
import {
  actionButton,
  deadCombatant,
  mountBattle,
  tile,
  view,
} from "../tests/battle-fake-mount";
import {
  type BattleCombatantView,
  battleCommandFor,
  destroyBattlePanel,
  refreshBattle,
  renderBattle,
} from "./panel";

let restoreDom: () => void;

beforeEach(() => {
  restoreDom = installBattleDom();
  clearFocusLog();
},);

afterEach(() => {
  destroyBattlePanel();
  restoreDom();
},);

const roster: BattleCombatantView[] = [
  { id: "alice", name: "Alice", hp: 25, maxHp: 30, initiative: 18, },
  { id: "orc", name: "Orc Grunt", hp: 8, maxHp: 20, initiative: 5, },
];

describe("battleCommandFor", () => {
  it("attack quotes a target name that contains spaces", () => {
    expect(battleCommandFor("attack", "orc", roster,),).toBe(`/attack "Orc Grunt"`,);
  });

  it("attack does not quote a single-word target name", () => {
    const singleWord = [{ id: "alice", name: "Alice", hp: 25, maxHp: 30, initiative: 18, },];
    expect(battleCommandFor("attack", "alice", singleWord,),).toBe("/attack Alice",);
  });

  it("attack returns null without a selected target", () => {
    expect(battleCommandFor("attack", null, roster,),).toBeNull();
  });

  it("heal maps to /heal with the target name", () => {
    expect(battleCommandFor("heal", "alice", roster,),).toBe("/heal Alice",);
  });

  it("heal returns null without a selected target", () => {
    expect(battleCommandFor("heal", null, roster,),).toBeNull();
  });

  it("end always maps to /battle end regardless of target", () => {
    expect(battleCommandFor("end", "alice", roster,),).toBe("/battle end",);
    expect(battleCommandFor("end", null, roster,),).toBe("/battle end",);
  });

  it("ignores a target id that is not in the roster", () => {
    expect(battleCommandFor("attack", "ghost", roster,),).toBeNull();
  });
});

describe("mountBattlePanel", () => {
  it("adds the panel class and shows the empty-state hint", () => {
    const { container, } = mountBattle(null,);
    expect(container.classList.contains("battle-panel",),).toBe(true,);
    expect(container.children.length,).toBe(1,);
    const hint = container.children[0]!;
    expect(hint.className,).toBe("battle-panel-empty",);
    expect(hint.textContent,).toBe("No active battle. Start one with /battle start.",);
  });

  it("renders header, roster and action bar for an active battle", () => {
    const { container, } = mountBattle(view(),);
    const overlay = container.children[0]!;
    expect(overlay.className,).toBe("battle-panel-content",);
    expect(overlay.getAttribute("role",),).toBe("group",);
    expect(overlay.getAttribute("aria-label",),).toBe("Battle controls",);
    expect(overlay.children.map((el,) => el.className),).toEqual([
      "battle-panel-header",
      "battle-roster",
      "battle-actions",
    ],);
    expect(overlay.children[0]!.innerHTML,).toContain("Round 2",);
  });

  it("marks the acting and dead roster states", () => {
    const { container, } = mountBattle(view({
      turnIndex: 1,
      combatants: [...roster, deadCombatant(),],
    },),);
    expect(tile(container, "alice",).classList.contains("is-acting",),).toBe(false,);
    const orc = tile(container, "orc",);
    expect(orc.classList.contains("is-acting",),).toBe(true,);
    expect(orc.getAttribute("aria-current",),).toBe("true",);
    const ghost = tile(container, "ghost",);
    expect(ghost.classList.contains("is-dead",),).toBe(true,);
    expect(ghost.disabled,).toBe(true,);
  });

  it("disables targeted actions until a combatant is selected", () => {
    const { container, } = mountBattle(view(),);
    expect(actionButton(container, "attack",).disabled,).toBe(true,);
    expect(actionButton(container, "heal",).disabled,).toBe(true,);
    expect(actionButton(container, "end",).disabled,).toBe(false,);
    tile(container, "alice",).click();
    expect(actionButton(container, "attack",).disabled,).toBe(false,);
    expect(actionButton(container, "heal",).disabled,).toBe(false,);
  });

  it("refreshBattle re-renders the last rendered state", () => {
    const { container, } = mountBattle(null,);
    refreshBattle();
    expect(container.children[0]!.className,).toBe("battle-panel-empty",);
    renderBattle(view(),);
    refreshBattle();
    expect(container.children[0]!.className,).toBe("battle-panel-content",);
  });
});

describe("target selection", () => {
  it("clicking a tile selects it and clicking again clears it", () => {
    const { container, } = mountBattle(view(),);
    tile(container, "alice",).click();
    expect(tile(container, "alice",).classList.contains("is-selected",),).toBe(true,);
    tile(container, "alice",).click();
    expect(tile(container, "alice",).classList.contains("is-selected",),).toBe(false,);
  });

  it("keeps a single selection when another tile is clicked", () => {
    const { container, } = mountBattle(view(),);
    tile(container, "alice",).click();
    tile(container, "orc",).click();
    expect(tile(container, "orc",).classList.contains("is-selected",),).toBe(true,);
    expect(tile(container, "alice",).classList.contains("is-selected",),).toBe(false,);
  });

  it("dead tiles ignore clicks", () => {
    const { container, } = mountBattle(
      view({ combatants: [...roster, deadCombatant(),], },),
    );
    tile(container, "ghost",).click();
    expect(tile(container, "ghost",).classList.contains("is-selected",),).toBe(false,);
    expect(actionButton(container, "attack",).disabled,).toBe(true,);
  });

  it("Escape clears the selection", () => {
    const { container, } = mountBattle(view(),);
    tile(container, "alice",).click();
    pressKey(container, "Escape",);
    expect(tile(container, "alice",).classList.contains("is-selected",),).toBe(false,);
    expect(actionButton(container, "attack",).disabled,).toBe(true,);
  });

  it("a fresh renderBattle resets the selection", () => {
    const { container, } = mountBattle(view(),);
    tile(container, "alice",).click();
    renderBattle(view(),);
    expect(tile(container, "alice",).classList.contains("is-selected",),).toBe(false,);
  });
});

describe("destroyBattlePanel", () => {
  it("detaches keyboard handling and stops rendering", () => {
    const { container, } = mountBattle(view(),);
    destroyBattlePanel();
    const frozenChildren = container.children.length;
    const focusBefore = lastFocus();
    pressKey(container, "ArrowRight",);
    renderBattle(view(),);
    refreshBattle();
    expect(container.children.length,).toBe(frozenChildren,);
    expect(lastFocus(),).toBe(focusBefore,);
    expect(() => destroyBattlePanel()).not.toThrow();
  });
});
