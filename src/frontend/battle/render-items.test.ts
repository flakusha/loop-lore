// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `renderItems` tests on the battle fake DOM: null when the battle carries no
 * items, one disabled-when-inactive row per item, and click-through to the
 * `executeItem` callback. Also pins the SOCIAL_ACTIONS bar contract the item
 * cycle relies on.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { type FakeEl, installBattleDom, } from "../tests/battle-fake-dom";
import { view, } from "../tests/battle-fake-mount";
import { SOCIAL_ACTIONS, } from "./commands";
import { renderHeader, renderItems, renderRoster, } from "./render";

let restoreDom: () => void;

// Pre-file catalog state: whatever earlier files in this worker left in place.
const localeStringsHost = globalThis as { __localeStrings?: unknown };
const initialLocaleStrings = localeStringsHost.__localeStrings;
let savedLocaleStrings: unknown;
let hasSavedLocaleStrings = false;

beforeEach(() => {
  restoreDom = installBattleDom();
  savedLocaleStrings = localeStringsHost.__localeStrings;
  hasSavedLocaleStrings = true;
  // Seed the alpine i18n catalog the roster/item labels resolve from.
  localeStringsHost.__localeStrings = {
    battle: {
      battleActions: "Battle actions",
      battleItems: "Battle items",
      environmentalEffects: "Environmental effects",
      health: "Health",
      log: "Battle log",
      statusEffects: "Status effects",
      targetSelection: "Target selection",
    },
  };
},);

afterEach(() => {
  restoreDom();
  if (hasSavedLocaleStrings) {
    localeStringsHost.__localeStrings = savedLocaleStrings;
    hasSavedLocaleStrings = false;
  }
},);

afterAll(() => {
  localeStringsHost.__localeStrings = initialLocaleStrings;
},);

const noopCallbacks = {
  select: () => {},
  execute: () => {},
  toggleItems: () => {},
  executeItem: () => {},
};

describe("renderItems", () => {
  const items = [
    { id: "potion", name: "Healing Draught", quantity: 2, },
    { id: "salve", name: "Aloe Salve", quantity: 1, },
  ];

  it("returns null when the battle has no items", () => {
    expect(renderItems(view({ items: [], },), noopCallbacks,),).toBeNull();
  });

  it("renders one labeled row per usable item", () => {
    const list = renderItems(view({ items, },), noopCallbacks,)!;
    expect(list.className,).toBe("battle-items",);
    const potion = list.querySelector('[data-battle-item="potion"]',)!;
    const salve = list.querySelector('[data-battle-item="salve"]',)!;
    expect(potion.textContent,).toBe("Healing Draught ×2",);
    expect(salve.textContent,).toBe("Aloe Salve ×1",);
  });

  it("clicking a row dispatches executeItem with that item", () => {
    let used: string | null = null;
    const list = renderItems(view({ items, },), {
      ...noopCallbacks,
      executeItem: (item,) => {
        used = item.id;
      },
    },)!;

    const row = list.querySelector('[data-battle-item="salve"]',)! as unknown as FakeEl;
    row.click();
    expect(used as string | null,).toBe("salve",);
  });
});

describe("SOCIAL_ACTIONS contract", () => {
  it("exposes one bar entry per social verb", () => {
    expect(SOCIAL_ACTIONS.map((s,) => s.kind),).toEqual([
      "social-intimidate",
      "social-taunt",
      "social-negotiate",
      "social-surrender",
    ],);
  });
});

describe("action economy + environment", () => {
  /** Depth-first class search over the fake DOM tree (panel nodes are FakeEls). */
  function findByClass(
    root: { className: string; children: ArrayLike<unknown> },
    name: string,
  ): FakeEl | null {
    for (const child of Array.from(root.children,)) {
      const node = child as { className: string; children: ArrayLike<unknown> };
      if (node.className.split(/\s+/,).includes(name,)) { return node as unknown as FakeEl; }

      const nested = findByClass(node, name,);
      if (nested) { return nested; }
    }

    return null;
  }

  it("renders the economy line when the backend delivers counters", () => {
    const roster = renderRoster(
      view({
        combatants: [
          {
            id: "alice",
            name: "Alice",
            hp: 25,
            maxHp: 30,
            initiative: 18,
            conditions: [],
            actions: 1,
            bonusActions: 0,
            reactions: 1,
          },
        ],
      },),
      null,
      noopCallbacks,
    );

    const economy = findByClass(roster, "battle-action-economy",)!;
    expect(economy.textContent,).toContain("1 action",);
    expect(economy.textContent,).toContain("0 bonus",);
    expect(economy.textContent,).toContain("1 reaction",);
  });

  it("omits the economy line when the backend delivers no counters", () => {
    const roster = renderRoster(view(), null, noopCallbacks,);
    expect(findByClass(roster, "battle-action-economy",),).toBeNull();
  });

  it("marks the roster tiles with pressed state", () => {
    const roster = renderRoster(view(), "orc", noopCallbacks,);
    const orc = roster.querySelector('[data-battle-id="orc"]',)!;
    expect(orc.getAttribute("aria-pressed",),).toBe("true",);
  });

  it("renders environmental badges in the header when delivered", () => {
    const header = renderHeader(view({ environmentalEffects: [{ name: "Weather: rain", },], },),);
    const badge = findByClass(header, "battle-environmental-badge",)!;
    expect(badge.textContent,).toBe("Weather: rain",);
  });

  it("renders no environmental row when none delivered", () => {
    const header = renderHeader(view(),);
    expect(findByClass(header, "battle-environmental-badge",),).toBeNull();
  });

  it("exposes the roster as a labeled toggle-button group", () => {
    const roster = renderRoster(view(), "orc", noopCallbacks,);
    expect(roster.getAttribute("role",),).toBe("group",);
    expect(roster.getAttribute("aria-label",),).toBe("Target selection",);
    const orc = roster.querySelector('[data-battle-id="orc"]',)!;
    expect(orc.getAttribute("role",),).toBeNull();
    expect(orc.getAttribute("aria-pressed",),).toBe("true",);
    expect(orc.getAttribute("aria-selected",),).toBeNull();
  });

  it("exposes the item menu as a button group", () => {
    const list = renderItems(
      view({
        items: [{ id: "potion", name: "Healing Draught", quantity: 2, },],
      },),
      noopCallbacks,
    )!;

    expect(list.getAttribute("role",),).toBe("group",);
    expect(list.getAttribute("aria-label",),).toBe("Battle items",);
    const row = list.querySelector('[data-battle-item="potion"]',)!;
    expect(row.getAttribute("role",),).toBeNull();
  });

  it("falls back to i18n keys when the catalog is empty", () => {
    localeStringsHost.__localeStrings = {};
    const roster = renderRoster(view(), null, noopCallbacks,);
    expect(roster.getAttribute("aria-label",),).toBe("battle.targetSelection",);
    const list = renderItems(
      view({
        items: [{ id: "potion", name: "Healing Draught", quantity: 2, },],
      },),
      noopCallbacks,
    )!;

    expect(list.getAttribute("aria-label",),).toBe("battle.battleItems",);
  });
});
