// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Player gold balance + atomic execute-trade slice for the NPC trading panel.
 *
 * Split out of `inventory-trading.ts` (size gate): this module owns the
 * GET /trade/balance fetch, the POST /trade/execute settle, and their state.
 * Spread into the trading Alpine scope (`...tradingBalanceSlice`); methods run
 * with `this` bound to the merged scope and reach the sibling trade state
 * through the `TradingBalanceHost` interface below.
 */
import type { TradeDraft, TradeSummary, } from "../inventory/trade-panel.js";
import { emptyDraft, tradeLines, } from "../inventory/trade-panel.js";
import { apiFetch, } from "./htmx.js";
import { t, } from "./i18n.js";
import { jsonBody, } from "./json.js";
import { log as rootLog, } from "./logger.js";

const log = rootLog.child({ module: "inventory-trading-balance", },);

/** Sibling trade state the balance/execute slice reads. */
export interface TradingBalanceHost {
  _worldId: string | null;
  _playerActorId: string | null;
  _npcActorId: string | null;
  busy: boolean;
  message: string;
  error: string;
  playerBalance: number | null;
  balanceLoading: boolean;
  balanceError: string;
  draft: TradeDraft;
  summary(): TradeSummary;
  load(): Promise<void>;
}

/** Balance state owned by this slice inside the merged trading scope. */
export interface TradingBalanceState {
  playerBalance: number | null;
  balanceLoading: boolean;
  balanceError: string;
}

/** POST helper: false on transport error or non-2xx. */
async function mutate(url: string, init: RequestInit,): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await apiFetch(url, init,);
    if (res.ok) { return { ok: true, }; }
    const body = await res.json().catch(() => ({})) as { error?: unknown; message?: unknown };
    const reason = typeof body.error === "string"
      ? body.error
      : typeof body.message === "string"
      ? body.message
      : "";

    return { ok: false, message: reason.length > 0 ? reason : undefined, };
  } catch (error) {
    log.error("Trade balance request failed", error instanceof Error ? error : undefined, { url, },);

    return { ok: false, };
  }
}

/** Balance + execute methods; spread into the trading scope. */
export const tradingBalanceSlice = {
  playerBalance: null as number | null,
  balanceLoading: false,
  balanceError: "",

  async loadBalance(this: TradingBalanceHost,): Promise<void> {
    const worldId = this._worldId;
    const actorId = this._playerActorId;
    if (!worldId || !actorId) { return; }

    this.balanceLoading = true;
    this.balanceError = "";
    try {
      const res = await apiFetch(`/api/v1/worlds/${worldId}/trade/balance?actorId=${actorId}`,);
      if (!res.ok) {
        this.balanceError = t("status.tradeBalanceFailed",);

        return;
      }

      const body = await res.json().catch(() => ({})) as { balance?: unknown };
      if (typeof body.balance !== "number") {
        this.balanceError = t("status.tradeBalanceFailed",);

        return;
      }

      this.playerBalance = body.balance;
    } catch (error) {
      log.error("Failed to load trade balance", error instanceof Error ? error : undefined, { actorId, },);
      this.balanceError = t("status.tradeBalanceFailed",);
    } finally {
      this.balanceLoading = false;
    }
  },

  async executeTrade(this: TradingBalanceHost,): Promise<void> {
    const worldId = this._worldId;
    const playerActorId = this._playerActorId;
    const npcActorId = this._npcActorId;
    if (!worldId || !playerActorId || !npcActorId) { return; }
    const summary = this.summary();
    if (summary.playerItems.length === 0 && summary.npcItems.length === 0) { return; }
    this.busy = true;
    this.error = "";
    this.message = "";
    const result = await mutate(`/api/v1/worlds/${worldId}/trade/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: jsonBody({
        buyerActorId: playerActorId,
        sellerActorId: npcActorId,
        buyerItems: tradeLines(summary.npcItems,),
        sellerItems: tradeLines(summary.playerItems,),
        price: Math.max(0, -summary.net,),
      },),
    },);

    this.busy = false;
    if (!result.ok) {
      this.error = result.message ?? t("status.tradeFailed",);

      return;
    }

    this.draft = emptyDraft();
    this.message = t("status.tradeConfirmed",);
    await this.load();
  },
};
