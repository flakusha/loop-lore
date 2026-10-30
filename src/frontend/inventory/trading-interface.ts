// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NPC trading interface — pure two-pane render over plain item rows.
 * Player list on one side, NPC list on the other, both with selection
 * toggles; a summary pane totals the draft from item `value` fields.
 * No fetch inside: the caller supplies lists, prices, and callbacks.
 */
import type { InventoryItem, } from "./inventory-grid.js";
import { summarizeTrade, type TradeDraft, } from "./trade-panel.js";

/** Callbacks for the trading interface. */
export interface TradingInterfaceActions {
  /** Fired when a row toggle changes one side's selection. */
  onToggle?: (side: "player" | "npc", itemId: string,) => void;
  /** Fired from the confirm button with the current draft. */
  onConfirm?: (draft: TradeDraft,) => void;
  /** Fired from the cancel button. */
  onCancel?: () => void;
}

/** Render options for the trading interface. */
export interface TradingInterfaceOptions {
  /** Current selection per side. */
  draft?: TradeDraft;
  /** Player gold for the header line. */
  playerGold?: number | null;
  /** NPC gold for the header line. */
  npcGold?: number | null;
  /** Disable the confirm button (e.g. while a trade request runs). */
  confirmDisabled?: boolean;
}

/**
 * Render the trading interface: two selection panes plus a trade summary
 * with confirm/cancel buttons.
 * @param container Element to render into; previous children are replaced.
 * @param playerItems Player-side rows.
 * @param npcItems NPC-side rows.
 * @param options Draft, gold headers, and confirm state.
 * @param actions Toggle/confirm/cancel callbacks.
 * @returns {void}
 */
export function renderTradingInterface(
  container: HTMLElement,
  playerItems: InventoryItem[],
  npcItems: InventoryItem[],
  options: TradingInterfaceOptions = {},
  actions: TradingInterfaceActions = {},
): void {
  const { draft = { playerIds: [], npcIds: [], }, playerGold = null, npcGold = null, confirmDisabled = false, } =
    options;

  const summary = summarizeTrade(playerItems, npcItems, draft,);
  container.replaceChildren();
  container.className = "trading-interface";
  container.append(
    buildPane("player", "Your Items", playerItems, draft.playerIds, playerGold, actions,),
    buildPane("npc", "Merchant Items", npcItems, draft.npcIds, npcGold, actions,),
    buildSummary(
      summary.playerItems.length,
      summary.npcItems.length,
      summary.playerValue,
      summary.npcValue,
      summary.net,
      confirmDisabled,
      draft,
      actions,
    ),
  );
}

/**
 * Build one selection pane: header (title + gold) plus a toggle button row
 * per item. Buttons show only when `onToggle` is supplied.
 * @param side Which side the pane renders.
 * @param title Pane heading.
 * @param items Rows for this side.
 * @param selected Selected ids for this side.
 * @param gold Gold header, hidden when null.
 * @param actions Toggle callback source.
 * @returns The pane element.
 */
function buildPane(
  side: "player" | "npc",
  title: string,
  items: InventoryItem[],
  selected: string[],
  gold: number | null,
  actions: TradingInterfaceActions,
): HTMLElement {
  const pane = document.createElement("div",);
  pane.className = `trading-pane trading-pane-${side}`;
  pane.setAttribute("data-trade-pane", side,);

  const heading = document.createElement("h3",);
  heading.className = "trading-pane-title";
  heading.setAttribute("data-trade-part", "title",);
  heading.textContent = title;
  pane.append(heading,);

  if (gold !== null) {
    const goldLine = document.createElement("div",);
    goldLine.className = "trading-pane-gold";
    goldLine.setAttribute("data-trade-part", "gold",);
    goldLine.textContent = `Gold: ${gold}`;
    pane.append(goldLine,);
  }

  const list = document.createElement("div",);
  list.className = "trading-pane-list";
  list.setAttribute("data-trade-part", "list",);
  if (items.length === 0) {
    const empty = document.createElement("div",);
    empty.className = "trading-empty";
    empty.setAttribute("data-trade-part", "empty",);
    empty.textContent = "No items.";
    list.append(empty,);
  }

  for (const item of items) {
    list.append(buildRow(side, item, selected.includes(item.id,), actions,),);
  }

  pane.append(list,);
  return pane;
}

/**
 * Build one selectable row: name, price line, and a select toggle button.
 * @param side Which side the row belongs to.
 * @param item Row to render.
 * @param isSelected Whether the row is in the draft.
 * @param actions Toggle callback source.
 * @returns The row element.
 */
function buildRow(
  side: "player" | "npc",
  item: InventoryItem,
  isSelected: boolean,
  actions: TradingInterfaceActions,
): HTMLElement {
  const row = document.createElement("div",);
  row.className = `trading-row${isSelected ? " selected" : ""}`;
  row.setAttribute("data-item-id", item.id,);
  row.setAttribute("data-trade-side", side,);

  const name = document.createElement("span",);
  name.className = "trading-row-name";
  name.setAttribute("data-trade-part", "name",);
  name.textContent = item.name;
  row.append(name,);

  const price = document.createElement("span",);
  price.className = "trading-row-price";
  price.setAttribute("data-trade-part", "price",);
  const each = item.value ?? 0;
  const total = each * (item.quantity ?? 1);
  price.textContent = side === "player" ? `Sell: ${total} Gold` : `Buy: ${total} Gold`;
  row.append(price,);

  if (actions.onToggle) {
    const onToggle = actions.onToggle;
    const toggle = document.createElement("button",);
    toggle.className = "trading-row-toggle";
    toggle.setAttribute("data-trade-action", "toggle",);
    toggle.textContent = isSelected ? "Remove" : "Select";
    toggle.addEventListener("click", () => {
      onToggle(side, item.id,);
    },);

    row.append(toggle,);
  }

  return row;
}

/**
 * Build the summary pane: counts, values, net, and confirm/cancel buttons.
 * @param playerCount Selected player-side rows.
 * @param npcCount Selected NPC-side rows.
 * @param playerValue Gold value of the player side.
 * @param npcValue Gold value of the NPC side.
 * @param net Player's net gold change.
 * @param confirmDisabled Whether the confirm button is disabled.
 * @param draft Current draft, passed to `onConfirm`.
 * @param actions Confirm/cancel callback source.
 * @returns The summary element.
 */
function buildSummary(
  playerCount: number,
  npcCount: number,
  playerValue: number,
  npcValue: number,
  net: number,
  confirmDisabled: boolean,
  draft: TradeDraft,
  actions: TradingInterfaceActions,
): HTMLElement {
  const summary = document.createElement("div",);
  summary.className = "trading-summary";
  summary.setAttribute("data-trade-pane", "summary",);

  const lines: Array<[string, string,]> = [
    ["sell", `You sell: ${playerCount} items (${playerValue} Gold)`,],
    ["buy", `You buy: ${npcCount} items (${npcValue} Gold)`,],
    ["net", `Net: ${net >= 0 ? "+" : ""}${net} Gold`,],
  ];

  for (const [part, text,] of lines) {
    const line = document.createElement("div",);
    line.className = `trading-summary-${part}`;
    line.setAttribute("data-trade-part", part,);
    line.textContent = text;
    summary.append(line,);
  }

  if (actions.onConfirm) {
    const onConfirm = actions.onConfirm;
    const confirm = document.createElement("button",);
    confirm.className = "trading-confirm";
    confirm.setAttribute("data-trade-action", "confirm",);
    confirm.textContent = "Confirm Trade";
    if (confirmDisabled) { confirm.setAttribute("disabled", "",); }
    confirm.addEventListener("click", () => {
      onConfirm(draft,);
    },);

    summary.append(confirm,);
  }

  if (actions.onCancel) {
    const onCancel = actions.onCancel;
    const cancel = document.createElement("button",);
    cancel.className = "trading-cancel";
    cancel.setAttribute("data-trade-action", "cancel",);
    cancel.textContent = "Cancel Trade";
    cancel.addEventListener("click", () => {
      onCancel();
    },);

    summary.append(cancel,);
  }

  return summary;
}
