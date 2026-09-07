// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { t, } from "elysia";
import type { Db, } from "../../db";
import type { TradeService, } from "../../services/trade";
import { Id, } from "../../validation/schemas";

/** One line of an item transfer within a trade. */
export const tradeLineSchema = t.Object({
  worldItemId: Id,
  quantity: t.Integer({ minimum: 1, },),
},);

export const executeBody = t.Object({
  buyerActorId: Id,
  sellerActorId: Id,
  buyerItems: t.Array(tradeLineSchema,),
  sellerItems: t.Array(tradeLineSchema,),
  price: t.Integer({ minimum: 0, },),
},);

export const executeResponse = t.Object({
  ok: t.Boolean(),
  pricePaid: t.Optional(t.Integer(),),
  itemsOffered: t.Optional(t.Array(Id,),),
  itemsRequested: t.Optional(t.Array(Id,),),
  reason: t.Optional(t.String(),),
},);

/** Options shared by every trade sub-plugin. */
export interface TradeRoutesOptions {
  database: Db;
  svc: () => TradeService;
}
