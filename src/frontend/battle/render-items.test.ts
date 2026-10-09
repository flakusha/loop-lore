// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `renderItems` tests on the battle fake DOM: null when the battle carries no
 * items, one disabled-when-inactive row per item, and click-through to the
 * `executeItem` callback. Also pins the SOCIAL_ACTIONS bar contract the item
 * cycle relies on.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { type FakeEl, installBattleDom, } from "../tests/battle-fake-dom";
import { view, } from "../tests/battle-fake-mount";
import { SOCIAL_ACTIONS, } from "./commands";
import { renderItems, } from "./render";

let restoreDom: () => void;

beforeEach(() => {
  restoreDom = installBattleDom();
},);

afterEach(() => {
  restoreDom();
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
