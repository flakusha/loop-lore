// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trading interface tests: draft units plus fake-dom two-pane render.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { installBattleDom, makeEl, query, } from "../tests/battle-fake-dom";
import type { InventoryItem, } from "./inventory-grid";
import {
  emptyDraft,
  enrichInstances,
  npcOwned,
  rowsFromBody,
  rowsValue,
  selectedRows,
  summarizeTrade,
  toggleId,
  tradeLines,
} from "./trade-panel";
import { renderTradingInterface, type TradingInterfaceOptions, } from "./trading-interface";

const sword = (overrides: Partial<InventoryItem> = {},): InventoryItem => ({
  id: "sword",
  name: "Iron Sword",
  itemType: "weapon",
  rarity: "common",
  quantity: 1,
  value: 50,
  ...overrides,
});

const potion = (overrides: Partial<InventoryItem> = {},): InventoryItem => ({
  id: "potion",
  name: "Health Potion",
  itemType: "consumable",
  rarity: "uncommon",
  quantity: 3,
  value: 10,
  ...overrides,
});

const steelSword = (overrides: Partial<InventoryItem> = {},): InventoryItem => ({
  id: "steel-sword",
  name: "Steel Sword",
  itemType: "weapon",
  rarity: "uncommon",
  quantity: 1,
  value: 100,
  ...overrides,
});

let restoreDom: () => void;

beforeEach(() => {
  restoreDom = installBattleDom();
},);

afterEach(() => {
  restoreDom();
},);

describe("trade draft", () => {
  test("toggleId adds then drops an id", () => {
    expect(toggleId([], "a",),).toEqual(["a",],);
    expect(toggleId(["a",], "a",),).toEqual([],);
  });

  test("summarizeTrade totals value x quantity per side with net", () => {
    const summary = summarizeTrade([sword(), potion(),], [steelSword(),], {
      playerIds: ["potion",],
      npcIds: ["steel-sword",],
    },);

    expect(summary.playerItems.map((item,) => item.id),).toEqual(["potion",],);
    expect(summary.playerValue,).toBe(30,);
    expect(summary.npcValue,).toBe(100,);
    expect(summary.net,).toBe(-70,);
  });

  test("summarizeTrade drops unknown ids; tradeLines maps id to worldItemId", () => {
    const summary = summarizeTrade([sword(),], [], { playerIds: ["nope",], npcIds: [], },);
    expect(summary.playerItems,).toEqual([],);
    expect(summary.playerValue,).toBe(0,);
    expect(tradeLines([sword(), potion(),],),).toEqual([
      { worldItemId: "sword", quantity: 1, },
      { worldItemId: "potion", quantity: 3, },
    ],);
  });

  test("enrichInstances joins instances to definitions by item_id", () => {
    const instances = [
      { ...sword(), id: "inst-1", item_id: "sword", },
      { ...sword(), id: "orphan", item_id: "missing-def", },
    ] as unknown as InventoryItem[];

    expect(enrichInstances(instances, [sword(),],),).toEqual([{ ...sword(), id: "inst-1", },],);
  });

  test("npcOwned skips null rows", () => {
    const body = [null, { id: "a", owner_actor_id: "npc-1", },] as unknown[];
    const expected = [{ id: "a", owner_actor_id: "npc-1", },] as unknown as InventoryItem[];
    expect(npcOwned(body, "npc-1",),).toEqual(expected,);
  });

  test("emptyDraft starts with both sides empty", () => {
    expect(emptyDraft(),).toEqual({ playerIds: [], npcIds: [], },);
  });

  test("selectedRows keeps only chosen ids", () => {
    expect(selectedRows([sword(), potion(),], ["potion",],).map((item,) => item.id),).toEqual(["potion",],);
  });

  test("rowsValue sums value x quantity", () => {
    expect(rowsValue([sword(), potion(),],),).toBe(80,);
    expect(rowsValue([{ ...sword(), value: undefined, quantity: undefined, },],),).toBe(0,);
  });

  test("rowsFromBody unwraps data and passes bare arrays through", () => {
    const rows = [sword(),];
    expect(rowsFromBody({ data: rows, },),).toEqual(rows,);
    expect(rowsFromBody(rows,),).toEqual(rows,);
    expect(rowsFromBody(null,),).toEqual([],);
  });
});

describe("renderTradingInterface", () => {
  const render = (options: TradingInterfaceOptions = {},) => {
    const root = makeEl("div",);
    const seen: Array<{ side: string; itemId: string }> = [];
    let confirmed: unknown = null;
    let cancelled = false;
    renderTradingInterface(
      root as unknown as HTMLElement,
      [sword(), potion(),],
      [steelSword(),],
      options,
      {
        onToggle: (side, itemId,) => {
          seen.push({ side, itemId, },);
        },
        onConfirm: (draft,) => {
          confirmed = draft;
        },
        onCancel: () => {
          cancelled = true;
        },
      },
    );

    return { root, seen, confirmed: () => confirmed, cancelled: () => cancelled, };
  };

  test("renders both panes with price lines and empty summary", () => {
    const { root, } = render({ playerGold: 1250, npcGold: 500, },);
    expect(root.className,).toBe("trading-interface",);
    expect(query(root, '[data-trade-pane="player"]',),).not.toBeNull();
    expect(query(root, '[data-trade-pane="npc"]',),).not.toBeNull();
    const summary = query(root, '[data-trade-pane="summary"]',);
    expect(summary?.children.find((child,) => child.getAttribute("data-trade-part",) === "sell")?.textContent,).toBe(
      "You sell: 0 items (0 Gold)",
    );

    expect(summary?.children.find((child,) => child.getAttribute("data-trade-part",) === "net")?.textContent,).toBe(
      "Net: +0 Gold",
    );

    // Player pane carries the sell line with stacked total; NPC pane the buy line.
    // (Fake textContent never composes from children, so walk the price parts.)
    const priceOf = (itemId: string,): string | undefined =>
      query(root, `[data-item-id="${itemId}"]`,)?.children.find(
        (child,) => child.getAttribute("data-trade-part",) === "price",
      )?.textContent;

    expect(priceOf("potion",),).toBe("Sell: 30 Gold",);
    expect(priceOf("steel-sword",),).toBe("Buy: 100 Gold",);
  });

  test("selected rows mark the draft and toggle fires", () => {
    const { root, seen, } = render({ draft: { playerIds: ["sword",], npcIds: [], }, },);
    expect(query(root, '[data-item-id="sword"]',)?.className.includes("selected",),).toBe(true,);
    expect(query(root, '[data-item-id="potion"]',)?.className.includes("selected",),).toBe(false,);
    const summary = query(root, '[data-trade-pane="summary"]',);
    expect(summary?.children.find((child,) => child.getAttribute("data-trade-part",) === "sell")?.textContent,).toBe(
      "You sell: 1 items (50 Gold)",
    );

    query(root, '[data-item-id="potion"]',)?.querySelector('[data-trade-action="toggle"]',)?.click();
    expect(seen,).toEqual([{ side: "player", itemId: "potion", },],);
  });

  test("confirm passes the draft; cancel fires; disabled confirm marks the button", () => {
    const draft = { playerIds: ["sword",], npcIds: ["steel-sword",], };
    const { root, confirmed, cancelled, } = render({ draft, confirmDisabled: true, },);
    query(root, '[data-trade-action="confirm"]',)?.click();
    expect(confirmed(),).toEqual(draft,);
    query(root, '[data-trade-action="cancel"]',)?.click();
    expect(cancelled(),).toBe(true,);
    expect(query(root, '[data-trade-action="confirm"]',)?.getAttribute("disabled",),).toBe("",);
  });

  test("empty panes render the empty state", () => {
    const root = makeEl("div",);
    renderTradingInterface(root as unknown as HTMLElement, [], [], {}, {},);
    expect(root.children.map((child,) => child.getAttribute("data-trade-pane",)),).toEqual([
      "player",
      "npc",
      "summary",
    ],);
  });
});
