// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Trade service types and constants. */

export const DEFAULT_CURRENCY = "gold" as const;

/** Type of trade — player↔player or player↔NPC. */
export type TradeType = "player_player" | "player_npc" | "npc_player";

/** */
export interface TradeResult {
  success: boolean;
  reason?: string;
  /** Currency moved from buyer to seller. */
  pricePaid?: number;
  /** Item instance IDs moved in each direction. */
  itemsOffered?: string[];
  itemsRequested?: string[];
}

/** */
export interface TradeLine {
  worldItemId: string;
  quantity: number;
}

/** Pending trade offer stored in crafting_orders. */
export interface TradeOffer {
  id: string;
  worldId: string;
  requesterActorId: string;
  crafterActorId: string | null;
  recipeId: string;
  quantity: number;
  maxQuality: string | null;
  offeredPayment: number;
  offeredMaterials: string[];
  requestedMaterials: string[];
  status: string;
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A row from trade_history. */
export interface TradeHistoryEntry {
  id: string;
  worldId: string;
  buyerActorId: string;
  sellerActorId: string;
  price: number;
  currencyType: string;
  itemsOffered: string[];
  itemsRequested: string[];
  tradeType: TradeType;
  createdAt: string;
}
