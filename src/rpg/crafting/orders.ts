// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Crafting Order Service
 *
 * Player-driven crafting commissions backed by the `crafting_orders` table:
 *   placeOrder    — open a commission (requester → any crafter)
 *   listOrders    — list a world's orders (optionally scoped to an actor)
 *   acceptOrder   — a crafter claims an open order
 *   fulfillOrder  — crafter runs the recipe, payment transfers on success
 *   cancelOrder   — requester cancels an open/accepted order
 *
 * Fulfilment delegates to `CraftingProcessService.attemptCraft` for the actual
 * craft (material consumption + output) and `TradeService.trade` for the gold
 * payment from requester to crafter.
 */
import type { Kysely, Selectable, } from "kysely";
import type { QualityLevel, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { CraftingOrders, } from "../../db/schema-crafting";
import { TradeService, } from "../../services/trade";
import { jsonParseOr, jsonStringifyOr, uid, } from "../../utils";
import { CraftingProcessService, type CraftResult, } from "./process";

/** A crafting commission as exposed by this service. */
export interface CraftingOrder {
  id: string;
  worldId: string;
  requesterActorId: string;
  crafterActorId: string | null;
  recipeId: string;
  quantity: number;
  maxQuality: QualityLevel | null;
  offeredPayment: number;
  offeredMaterials: unknown[];
  status: string;
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
  tradeType: string;
}

/** Inputs for opening a new crafting order. */
export interface PlaceOrderInput {
  worldId: string;
  requesterActorId: string;
  recipeId: string;
  quantity?: number;
  offeredPayment?: number;
  offeredMaterials?: unknown[];
  maxQuality?: QualityLevel | null;
  deadline?: string | null;
  tradeType?: string;
}

/** Result of a fulfilment attempt. */
export interface FulfillResult {
  ok: boolean;
  reason?: string;
  attemptId?: string;
}

export class CraftingOrderService {
  private readonly db: Kysely<DB>;
  private readonly process: CraftingProcessService;
  private readonly trade: TradeService;

  constructor(db: Kysely<DB>,) {
    this.db = db;
    this.process = new CraftingProcessService(db,);
    this.trade = new TradeService(db,);
  }

  /** Open a new crafting commission in the `open` state. Returns the new order id. */
  async placeOrder(input: PlaceOrderInput,): Promise<string> {
    const now = new Date().toISOString();
    const id = uid();
    await this.db.insertInto("crafting_orders",).values({
      id,
      world_id: input.worldId,
      requester_actor_id: input.requesterActorId,
      crafter_actor_id: null,
      recipe_id: input.recipeId,
      quantity: input.quantity ?? 1,
      max_quality: input.maxQuality ?? null,
      offered_payment: input.offeredPayment ?? 0,
      offered_materials: jsonStringifyOr(input.offeredMaterials ?? [], "[]",),
      status: "open",
      deadline: input.deadline ?? null,
      created_at: now,
      updated_at: now,
      trade_type: input.tradeType ?? "crafting",
    },).execute();
    return id;
  }

  /** List orders for a world; when `actorId` is given, scope to orders touching that actor. */
  async listOrders(worldId: string, actorId?: string,): Promise<CraftingOrder[]> {
    let query = this.db.selectFrom("crafting_orders",)
      .selectAll()
      .where("world_id", "=", worldId,);
    if (actorId) {
      query = query.where((eb,) =>
        eb.or([
          eb("requester_actor_id", "=", actorId,),
          eb("crafter_actor_id", "=", actorId,),
        ],)
      );
    }
    const rows = await query.execute();
    return Array.from(rows, (r,) => this.toCraftingOrder(r,),);
  }

  /** A crafter claims an order; only succeeds while the order is still `open`. */
  async acceptOrder(orderId: string, crafterActorId: string,): Promise<boolean> {
    const now = new Date().toISOString();
    const res = await this.db.updateTable("crafting_orders",)
      .set({ crafter_actor_id: crafterActorId, status: "accepted", updated_at: now, },)
      .where("id", "=", orderId,)
      .where("status", "=", "open",)
      .executeTakeFirst();
    return Number(res?.numUpdatedRows ?? 0,) > 0;
  }

  /**
   * Fulfil an accepted order: run the recipe as the requester, transfer the
   * offered payment from requester to crafter, then mark the order fulfilled.
   */
  async fulfillOrder(orderId: string,): Promise<FulfillResult> {
    const order = await this.db.selectFrom("crafting_orders",)
      .selectAll()
      .where("id", "=", orderId,)
      .executeTakeFirst();
    if (!order) { return { ok: false, reason: "order not found", }; }
    if (order.status !== "accepted" || !order.crafter_actor_id) {
      return { ok: false, reason: "order is not accepted by a crafter", };
    }

    let attempt: CraftResult;
    try {
      attempt = await this.process.attemptCraft({
        actorId: order.requester_actor_id,
        worldId: order.world_id,
        recipeId: order.recipe_id,
      },);
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error,), };
    }

    if (order.offered_payment > 0) {
      const paid = await this.trade.trade({
        worldId: order.world_id,
        buyerActorId: order.requester_actor_id,
        sellerActorId: order.crafter_actor_id,
        buyerItems: [],
        sellerItems: [],
        price: order.offered_payment,
      },);
      if (!paid.success) { return { ok: false, reason: "payment failed", }; }
    }

    await this.db.updateTable("crafting_orders",)
      .set({ status: "fulfilled", updated_at: new Date().toISOString(), },)
      .where("id", "=", orderId,)
      .execute();
    return { ok: true, attemptId: attempt.attemptId, };
  }

  /** Requester cancels an order that is still `open` or `accepted`. */
  async cancelOrder(orderId: string, actorId: string,): Promise<boolean> {
    const order = await this.db.selectFrom("crafting_orders",)
      .selectAll()
      .where("id", "=", orderId,)
      .executeTakeFirst();
    if (!order) { return false; }
    if (order.requester_actor_id !== actorId) { return false; }
    if (order.status !== "open" && order.status !== "accepted") { return false; }
    const res = await this.db.updateTable("crafting_orders",)
      .set({ status: "cancelled", updated_at: new Date().toISOString(), },)
      .where("id", "=", orderId,)
      .where("requester_actor_id", "=", actorId,)
      .where("status", "in", ["open", "accepted",],)
      .executeTakeFirst();
    return Number(res?.numUpdatedRows ?? 0,) > 0;
  }

  /** Map a `crafting_orders` row to the service-level {@link CraftingOrder}. */
  private toCraftingOrder(r: Selectable<CraftingOrders>,): CraftingOrder {
    return {
      id: r.id,
      worldId: r.world_id,
      requesterActorId: r.requester_actor_id,
      crafterActorId: r.crafter_actor_id,
      recipeId: r.recipe_id,
      quantity: r.quantity,
      maxQuality: r.max_quality,
      offeredPayment: r.offered_payment,
      offeredMaterials: jsonParseOr<unknown[]>(r.offered_materials, [],),
      status: r.status,
      deadline: r.deadline,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      tradeType: r.trade_type,
    };
  }
}
