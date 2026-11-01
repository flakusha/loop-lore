// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battle panel live region + 1-9 keynav slots (fake-DOM style: installBattleDom
 * document fake, no real browser). Slot ordering lives in commands.ts —
 * enabledActionSlots/battleAnnouncement are asserted through the deps seam here.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import {
  __resetKeynavHandlersForTests,
  dispatchKeynavActionToHandlers,
} from "../alpine/shortcuts";
import { installBattleDom, } from "../tests/battle-fake-dom";
import { mountBattle, view, } from "../tests/battle-fake-mount";
import { type BattleActionKind, } from "./commands";
import { destroyBattlePanel, } from "./panel";
import type { PanelFocusDeps, } from "./panel-focus";
import {
  announceBattle,
  BATTLE_SLOT_ACTIONS,
  type BattleAnnouncer,
  createBattleAnnouncer,
  registerBattleSlotHandlers,
  selectBattleActionSlot,
} from "./panel-live";

let restoreDom: () => void;

beforeEach(() => {
  restoreDom = installBattleDom();
},);

afterEach(() => {
  destroyBattlePanel();
  __resetKeynavHandlersForTests();
  restoreDom();
},);

/** Deps fake with recording spies for the two slot-dispatch sinks. */
function depsWith(overrides: Partial<PanelFocusDeps> = {},): {
  deps: PanelFocusDeps;
  executed: string[];
  counters: { itemsToggled: number };
} {
  const executed: string[] = [];
  const counters = { itemsToggled: 0, };
  const deps: PanelFocusDeps = {
    selectedTargetId: "orc",
    itemsOpen: false,
    battle: view(),
    focusTargets: [],
    focusedIndex: 0,
    render: () => {},
    toggleItems: () => {
      counters.itemsToggled += 1;
    },
    dispatchItem: () => Promise.resolve(),
    executeAction: (kind: BattleActionKind,) => {
      executed.push(kind,);
      return Promise.resolve();
    },
    ...overrides,
  };

  return { deps, executed, counters, };
}

describe("BATTLE_SLOT_ACTIONS", () => {
  it("exposes the nine battle-slot-1..9 keymap action ids", () => {
    expect(BATTLE_SLOT_ACTIONS,).toEqual([
      "battle-slot-1",
      "battle-slot-2",
      "battle-slot-3",
      "battle-slot-4",
      "battle-slot-5",
      "battle-slot-6",
      "battle-slot-7",
      "battle-slot-8",
      "battle-slot-9",
    ],);
  });
});

describe("selectBattleActionSlot", () => {
  it("dispatches the first enabled action (End battle when no target)", () => {
    const { deps, executed, } = depsWith({ selectedTargetId: null, },);
    selectBattleActionSlot(deps, 1,);
    expect(executed,).toEqual(["end",],);
  });

  it("maps slot order to the enabled bar: attack, heal, end", () => {
    const { deps, executed, } = depsWith();
    selectBattleActionSlot(deps, 1,);
    selectBattleActionSlot(deps, 2,);
    selectBattleActionSlot(deps, 3,);
    expect(executed,).toEqual(["attack", "heal", "end",],);
  });

  it("routes the Item slot to toggleItems when items exist", () => {
    const { deps, executed, counters, } = depsWith({
      battle: view({ items: [{ id: "i1", name: "Potion", quantity: 1, },], },),
    },);

    // Bar order with a target and one item: attack, heal, end, item.
    selectBattleActionSlot(deps, 4,);
    expect(executed,).toEqual([],);
    expect(counters.itemsToggled,).toBe(1,);
  });

  it("is a no-op for out-of-range slots, inactive battles, and disabled actions", () => {
    const { deps, executed, counters, } = depsWith({ selectedTargetId: null, },);
    selectBattleActionSlot(deps, 0,);
    selectBattleActionSlot(deps, 99,);
    selectBattleActionSlot(deps, -1,);
    // Disabled slot (no target → attack disabled, slot 1 is "end", so slot 2
    // is past the enabled list).
    selectBattleActionSlot(deps, 2,);
    const inactive = depsWith({ battle: view({ status: "ended", },), },);
    selectBattleActionSlot(inactive.deps, 1,);
    const battleless = depsWith({ battle: null, },);
    selectBattleActionSlot(battleless.deps, 1,);
    expect(executed,).toEqual([],);
    expect(counters.itemsToggled,).toBe(0,);
  });
});

describe("registerBattleSlotHandlers", () => {
  it("dispatches digits to slot handlers and unsubscribes cleanly", () => {
    const { deps, executed, } = depsWith();
    const unregister = registerBattleSlotHandlers(deps,);

    dispatchKeynavActionToHandlers("battle-slot-1",);
    dispatchKeynavActionToHandlers("battle-slot-9",);
    // Slot 9 with a target and no items: bar is attack, heal, end → slot 9
    // is past the end, so only slot 1 fired.
    expect(executed,).toEqual(["attack",],);

    executed.length = 0;
    unregister();
    dispatchKeynavActionToHandlers("battle-slot-1",);
    expect(executed,).toEqual([],);
  });
});

describe("battle announcer", () => {
  it("announces round, turn, and battle end, deduplicating repeats", () => {
    const state: BattleAnnouncer = createBattleAnnouncer();

    announceBattle(state, view(),);
    expect(state.node.textContent,).toBe("Round 2: Alice's turn",);

    // Same state again → no text churn (screen readers re-announce writes).
    announceBattle(state, view(),);
    expect(state.node.textContent,).toBe("Round 2: Alice's turn",);

    announceBattle(state, view({ round: 3, },),);
    expect(state.node.textContent,).toBe("Round 3: Alice's turn",);

    announceBattle(state, view({ status: "ended", },),);
    expect(state.node.textContent,).toBe("Battle ended",);
  });

  it("clears to empty for a null battle and copes with a missing combatant", () => {
    const state: BattleAnnouncer = createBattleAnnouncer();
    announceBattle(state, null,);
    expect(state.node.textContent,).toBe("",);

    announceBattle(state, view({ turnIndex: 7, },),);
    expect(state.node.textContent,).toBe("Round 2: no active combatant",);
  });

  it("creates a visually hidden polite live region", () => {
    const state = createBattleAnnouncer();
    expect(state.node.className,).toBe("sr-only",);
    expect(state.node.getAttribute("aria-live",),).toBe("polite",);
    expect(state.node.getAttribute("aria-atomic",),).toBe("true",);
    expect(state.node.getAttribute("data-testid",),).toBe("battle-announcer",);
  });

  it("survives a panel render cycle: the node object persists across renders", () => {
    const { container, } = mountBattle(view(),);
    const announcer = container.children.find(
      (child,) => child.getAttribute("data-testid",) === "battle-announcer",
    );

    expect(announcer,).toBeDefined();
    expect(announcer!.textContent,).toBe("Round 2: Alice's turn",);
  });
});
