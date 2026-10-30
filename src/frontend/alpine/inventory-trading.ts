// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 280
// One Alpine scope for both trade sides: two loaders, two legs, one draft.

// ── NPC trading state (Phase 3: NPC buy/sell; offers arrive in Phase 4).
// Drives:
//   GET    /api/v1/actors/:actorId/items                       (player list)
//   GET    /api/v1/worlds/:worldId/item-instances             (NPC stock, owner_actor_id filter is client-side)
//   POST   /api/v1/worlds/:worldId/trade/buy-from-npc         { buyerActorId, npcActorId, sellerItems, price }
//   POST   /api/v1/worlds/:worldId/trade/sell-to-npc          { sellerActorId, npcActorId, buyerItems, price }
// Selection/pricing reuse src/frontend/inventory/trade-panel.ts.
// World + NPC ids are set by the host page; lists load on demand and both
// sides refetch after every confirmed trade instead of holding a stream.
import type { InventoryItem, } from "../inventory/inventory-grid.js";
import {
  emptyDraft,
  enrichInstances,
  npcOwned,
  rowsFromBody,
  rowsValue,
  selectedRows,
  summarizeTrade,
  toggleId,
  type TradeDraft,
  type TradeLine,
  tradeLines,
  type TradeSummary,
} from "../inventory/trade-panel.js";
import { apiFetch, } from "./htmx.js";
import { t, } from "./i18n.js";
import { jsonBody, } from "./json.js";
import { log as rootLog, } from "./logger.js";

const log = rootLog.child({ module: "inventory-trading", },);

/** Alpine scope for the NPC trading panel. */
export interface InventoryTradingState {
  _worldId: string | null;
  _playerActorId: string | null;
  _npcActorId: string | null;
  playerItems: InventoryItem[];
  npcItems: InventoryItem[];
  playerLoading: boolean;
  npcLoading: boolean;
  playerLoadError: string;
  npcLoadError: string;
  busy: boolean;
  message: string;
  error: string;
  draft: TradeDraft;
  /** Point the panel at a world/player/NPC triple; clears lists + draft. */
  setTradeActors(worldId: string, playerActorId: string, npcActorId: string,): void;
  /** Toggle one row in one side's selection. */
  toggle(side: "player" | "npc", itemId: string,): void;
  /** Clear both sides' selections. */
  clearDraft(): void;
  /** Reload player + NPC lists. */
  load(): Promise<void>;
  /** Reload the player list from the server. */
  loadPlayerItems(): Promise<void>;
  /** Reload the NPC list from the server. */
  loadNpcItems(): Promise<void>;
  /** Rows per side plus gold totals for the current draft. */
  summary(): TradeSummary;
  /** Confirm: split the draft into sell + buy legs against the NPC routes. */
  confirm(): Promise<void>;
  /** Buy the selected NPC rows for their listed gold value. */
  buyFromNpc(): Promise<void>;
  /** Sell the selected player rows for their listed gold value. */
  sellToNpc(): Promise<void>;
}

/** Route body for one NPC trade leg (buy-: buyerActorId/sellerItems; sell-: sellerActorId/buyerItems). */
type NpcTradePayload = {
  buyerActorId?: string;
  sellerActorId?: string;
  npcActorId: string;
  sellerItems?: TradeLine[];
  buyerItems?: TradeLine[];
  price: number;
};

/** Build a state with defaults; no auto-load so tests skip the side effect. */
export const stateFromTradeActors = (
  worldId: string | null = null,
  playerActorId: string | null = null,
  npcActorId: string | null = null,
): InventoryTradingState => ({
  _worldId: worldId,
  _playerActorId: playerActorId,
  _npcActorId: npcActorId,
  playerItems: [],
  npcItems: [],
  playerLoading: false,
  npcLoading: false,
  playerLoadError: "",
  npcLoadError: "",
  busy: false,
  message: "",
  error: "",
  draft: emptyDraft(),

  setTradeActors(worldId: string, playerActorId: string, npcActorId: string,) {
    this._worldId = worldId;
    this._playerActorId = playerActorId;
    this._npcActorId = npcActorId;
    this.playerItems = [];
    this.npcItems = [];
    this.draft = emptyDraft();
    this.playerLoadError = "";
    this.npcLoadError = "";
    this.message = "";
    this.error = "";
  },

  toggle(side: "player" | "npc", itemId: string,) {
    const known = side === "player" ? this.playerItems : this.npcItems;
    if (!known.some((item,) => item.id === itemId)) { return; }
    if (side === "player") {
      this.draft = { ...this.draft, playerIds: toggleId(this.draft.playerIds, itemId,), };
    } else {
      this.draft = { ...this.draft, npcIds: toggleId(this.draft.npcIds, itemId,), };
    }
  },

  clearDraft() {
    this.draft = emptyDraft();
  },

  async load() {
    await this.loadPlayerItems();
    await this.loadNpcItems();
  },

  async loadPlayerItems() {
    const actorId = this._playerActorId;
    if (!actorId) {
      return;
    }

    this.playerLoading = true;
    this.playerLoadError = "";
    try {
      const res = await apiFetch(`/api/v1/actors/${actorId}/items`,);
      if (!res.ok) {
        this.playerLoadError = t("status.inventoryLoadFailed",);
        return;
      }

      this.playerItems = rowsFromBody(await res.json(),);
      this.draft = {
        playerIds: this.draft.playerIds.filter((id,) => this.playerItems.some((item,) => item.id === id)),
        npcIds: this.draft.npcIds,
      };
    } catch (error) {
      log.error("Failed to load trade player items", error instanceof Error ? error : undefined, { actorId, },);
      this.playerLoadError = t("status.inventoryLoadFailed",);
    } finally {
      this.playerLoading = false;
    }
  },

  async loadNpcItems() {
    const worldId = this._worldId;
    const npcActorId = this._npcActorId;
    if (!worldId || !npcActorId) { return; }
    this.npcLoading = true;
    this.npcLoadError = "";
    try {
      const instRes = await apiFetch(`/api/v1/worlds/${worldId}/item-instances`,);
      const defRes = await apiFetch(`/api/v1/worlds/${worldId}/items?pageSize=100`,);
      if (!instRes.ok || !defRes.ok) {
        this.npcLoadError = t("status.tradeNpcLoadFailed",);

        return;
      }

      this.npcItems = enrichInstances(
        npcOwned(await instRes.json(), npcActorId,),
        rowsFromBody(await defRes.json(),),
      );

      this.draft = {
        playerIds: this.draft.playerIds,
        npcIds: this.draft.npcIds.filter((id,) => this.npcItems.some((item,) => item.id === id)),
      };
    } catch (error) {
      log.error("Failed to load NPC items", error instanceof Error ? error : undefined, { npcActorId, },);
      this.npcLoadError = t("status.tradeNpcLoadFailed",);
    } finally {
      this.npcLoading = false;
    }
  },

  summary() {
    return summarizeTrade(this.playerItems, this.npcItems, this.draft,);
  },

  async confirm() {
    const summary = this.summary();
    if (summary.playerItems.length > 0) {
      await this.sellToNpc();
      if (this.error) {
        return;
      }
    }

    if (summary.npcItems.length > 0) {
      await this.buyFromNpc();
    }
  },

  async buyFromNpc() {
    await tradeSide(this, "npc",);
  },

  async sellToNpc() {
    await tradeSide(this, "player",);
  },
});

/**
 * Trade one side's selection: guard ids, build lines, POST the NPC route.
 * Buy moves NPC rows to the player; sell moves player rows to the NPC.
 * @param state Trading state (this).
 * @param side Selection side to settle.
 */
async function tradeSide(state: InventoryTradingState, side: "player" | "npc",): Promise<void> {
  const worldId = state._worldId;
  const playerActorId = state._playerActorId;
  const npcActorId = state._npcActorId;
  if (!worldId || !playerActorId || !npcActorId) {
    return;
  }

  const rows = selectedRows(
    side === "player" ? state.playerItems : state.npcItems,
    side === "player" ? state.draft.playerIds : state.draft.npcIds,
  );

  if (rows.length === 0) {
    return;
  }

  const lines = tradeLines(rows,);
  const price = rowsValue(rows,);
  const leg = side === "player" ? "sell-to-npc" : "buy-from-npc";
  const payload: NpcTradePayload = side === "player"
    ? { sellerActorId: playerActorId, npcActorId, buyerItems: lines, price, }
    : { buyerActorId: playerActorId, npcActorId, sellerItems: lines, price, };

  await runLeg(state, `/api/v1/worlds/${worldId}/trade/${leg}`, payload, side,);
}

/**
 * One trade leg: POST the NPC route, then refetch both lists and drop fulfilled ids.
 * @param state Trading state (this).
 * @param url NPC trade route.
 * @param payload Route body.
 * @param clearSide Draft side to clear on success.
 * @returns {Promise<void>}
 */
async function runLeg(
  state: InventoryTradingState,
  url: string,
  payload: NpcTradePayload,
  clearSide: "player" | "npc",
): Promise<void> {
  state.busy = true;
  state.error = "";
  state.message = "";
  const result = await mutate(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: jsonBody(payload,),
  },);

  state.busy = false;
  if (!result.ok) {
    state.error = result.message ?? t("status.tradeFailed",);

    return;
  }

  state.draft = clearSide === "player" ? { ...state.draft, playerIds: [], } : { ...state.draft, npcIds: [], };
  state.message = t("status.tradeConfirmed",);
  await state.load();
}

/** POST helper: false on transport error or non-2xx. */
async function mutate(url: string, init: RequestInit,): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await apiFetch(url, init,);
    if (res.ok) { return { ok: true, }; }
    const body = (await res.json().catch(() => ({}))) as { message?: string };

    return { ok: false, message: body.message, };
  } catch (error) {
    log.error("NPC trade request failed", error instanceof Error ? error : undefined, { url, },);

    return { ok: false, };
  }
}

/**
 * Build the Alpine scope for one player/NPC pair in a world.
 * @param worldId World the trade settles in.
 * @param playerActorId Player side.
 * @param npcActorId NPC side.
 * @returns Trading state; caller triggers `load()`.
 */
export function inventoryTradingFactory(
  worldId: string,
  playerActorId: string,
  npcActorId: string,
): InventoryTradingState {
  return stateFromTradeActors(worldId, playerActorId, npcActorId,);
}

export const inventoryTrading = stateFromTradeActors();

(globalThis as Record<string, unknown>).inventoryTradingFactory = inventoryTradingFactory;
(globalThis as Record<string, unknown>).inventoryTrading = inventoryTrading;
