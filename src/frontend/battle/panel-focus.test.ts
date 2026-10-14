// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Direct unit tests for the panel-focus keyboard module: cycle order,
 * wrap-around, selection toggling, item dispatch, and focus preservation.
 */
import { describe, expect, it, } from "bun:test";
import type { BattleFocusTarget, BattleItemView, BattleView, } from "./commands.js";
import {
  buildFocusTargets,
  handlePanelKey,
  type PanelFocusDeps,
  rebuildFocus,
} from "./panel-focus.js";

const battle: BattleView = {
  id: "b1",
  status: "active",
  round: 1,
  turnIndex: 0,
  items: [{ id: "potion", name: "Draught", quantity: 1, },],
  combatants: [
    { id: "alice", name: "Alice", hp: 10, maxHp: 10, initiative: 1, },
    { id: "orc", name: "Orc", hp: 0, maxHp: 10, initiative: 2, },
  ],
} as unknown as BattleView;

/** Mutable fake panel state wired to the focus module. */
function makeDeps(overrides: Partial<PanelFocusDeps> = {},): PanelFocusDeps & {
  events: string[];
  items: BattleItemView[];
} {
  const state = {
    events: [] as string[],
    selectedTargetId: null as string | null,
    itemsOpen: false,
    battle,
    focusTargets: [] as BattleFocusTarget[],
    focusedIndex: 0,
    items: [] as BattleItemView[],
    render: () => {
      state.events.push("render",);
    },
    toggleItems: () => {
      state.events.push("toggle",);
      state.itemsOpen = !state.itemsOpen;
    },
    dispatchItem: (item: BattleItemView,) => {
      state.events.push(`item:${item.id}`,);
      return Promise.resolve();
    },
    executeAction: (kind: PanelFocusDeps["executeAction"] extends (k: infer K,) => unknown ? K : never,) => {
      state.events.push(`action:${String(kind,)}`,);
      return Promise.resolve();
    },
  };

  Object.assign(state, overrides,);
  return state;
}

/** Keydown helper. */
function press(deps: PanelFocusDeps, key: string,): void {
  handlePanelKey({ key, preventDefault: () => {}, } as KeyboardEvent, deps,);
}

describe("buildFocusTargets", () => {
  it("orders alive combatants, then actions, then open item rows", () => {
    const deps = makeDeps({ itemsOpen: true, },);
    buildFocusTargets(deps,);
    expect(deps.focusTargets,).toEqual([
      { type: "combatant", id: "alice", },
      { type: "action", kind: "attack", },
      { type: "action", kind: "heal", },
      { type: "action", kind: "end", },
      { type: "action", kind: "item", },
      { type: "action", kind: "social-intimidate", },
      { type: "action", kind: "social-taunt", },
      { type: "action", kind: "social-negotiate", },
      { type: "action", kind: "social-surrender", },
      { type: "item", id: "potion", },
    ],);
  });

  it("clears targets when there is no battle", () => {
    const deps = makeDeps({ battle: null, focusTargets: [{ type: "action", kind: "attack", },], },);
    buildFocusTargets(deps,);
    expect(deps.focusTargets,).toEqual([],);
  });
});

describe("handlePanelKey", () => {
  it("escape clears the selection", () => {
    const deps = makeDeps({ selectedTargetId: "alice", },);
    buildFocusTargets(deps,);
    press(deps, "Escape",);
    expect(deps.selectedTargetId,).toBeNull();
    expect(deps.events,).toContain("render",);
  });

  it("arrows cycle with wrap-around and re-render", () => {
    const deps = makeDeps();
    buildFocusTargets(deps,);
    deps.focusedIndex = 0;
    press(deps, "ArrowLeft",);
    expect(deps.focusedIndex,).toBe(deps.focusTargets.length - 1,);
    press(deps, "ArrowRight",);
    expect(deps.focusedIndex,).toBe(0,);
    expect(deps.events,).toContain("render",);
  });

  it("enter selects the focused combatant and toggles off on repeat", () => {
    const deps = makeDeps();
    buildFocusTargets(deps,);
    deps.focusedIndex = 0; // alice
    press(deps, "Enter",);
    expect(deps.selectedTargetId,).toBe("alice",);
    press(deps, "Enter",);
    expect(deps.selectedTargetId,).toBeNull();
  });

  it("enter on the item action toggles the item menu", () => {
    const deps = makeDeps();
    buildFocusTargets(deps,);
    deps.focusedIndex = deps.focusTargets.findIndex((t,) => t.type === "action" && t.kind === "item");
    press(deps, " ",);
    expect(deps.events,).toContain("toggle",);
  });

  it("enter on an item row dispatches that item", () => {
    const deps = makeDeps({ itemsOpen: true, },);
    buildFocusTargets(deps,);
    deps.focusedIndex = deps.focusTargets.findIndex((t,) => t.type === "item");
    press(deps, "Enter",);
    expect(deps.events,).toContain("item:potion",);
  });

  it("enter calls preventDefault to suppress double-post", () => {
    const deps = makeDeps();
    buildFocusTargets(deps,);
    deps.focusedIndex = 0;
    let prevented = false;
    handlePanelKey({
      key: "Enter",
      preventDefault: () => {
        prevented = true;
      },
    } as KeyboardEvent, deps,);

    expect(prevented,).toBe(true,);
  });

  it("space calls preventDefault to suppress double-post", () => {
    const deps = makeDeps();
    buildFocusTargets(deps,);
    deps.focusedIndex = 0;
    let prevented = false;
    handlePanelKey({
      key: " ",
      preventDefault: () => {
        prevented = true;
      },
    } as KeyboardEvent, deps,);

    expect(prevented,).toBe(true,);
  });
});

describe("rebuildFocus", () => {
  it("keeps focus on the same logical target after a rebuild", () => {
    const deps = makeDeps();
    buildFocusTargets(deps,);
    deps.focusedIndex = 0; // alice
    deps.focusTargets = []; // simulate a re-render wiping the array
    rebuildFocus(deps,);
    expect(deps.focusTargets[deps.focusedIndex]?.type,).toBe("combatant",);
    expect((deps.focusTargets[deps.focusedIndex] as { id?: string }).id,).toBe("alice",);
  });
});
