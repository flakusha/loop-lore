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
import { type Kysely, type Selectable, sql, } from "kysely";
import { withTransaction, } from "../../characters/services/shared-service-utils";
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

/**
 * Fulfilment aborted after the claim: the transaction rolls back, so the
 * order stays `accepted` and the failure maps to the public refused shape.
 */
class FulfillAbortError extends Error {
  constructor(reason: string,) {
    super(reason,);
    this.name = "FulfillAbortError";
  }
}

/** */
export class CraftingOrderService {
  private readonly db: Kysely<DB>;

  /**
   * @param db
   */
  constructor(db: Kysely<DB>,) {
    this.db = db;
  }

  /**
   * Open a new crafting commission in the `open` state. Returns the new order id.
   * @param input
   * @returns the id of the newly created order
   */
  async placeOrder(input: PlaceOrderInput,): Promise<string> {
    // Service-level guards: a zero/negative quantity or a negative payment
    // must not reach the insert (BUG-service-layer-multi-query-mutations-run-without-transactions).
    if (input.quantity !== undefined && (!Number.isInteger(input.quantity,) || input.quantity <= 0)) {
      throw new Error("Order quantity must be a positive integer",);
    }

    if (input.offeredPayment !== undefined && input.offeredPayment < 0) {
      throw new Error("Offered payment must not be negative",);
    }

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

  /**
   * List orders for a world; when `actorId` is given, scope to orders touching that actor.
   * @param worldId
   * @param actorId
   * @returns the world's orders, narrowed to ones involving the actor when one is given
   */
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

  /**
   * A crafter claims an order; only succeeds while the order is still `open`.
   * @param orderId
   * @param crafterActorId
   * @returns true when this crafter won the claim
   */
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
   * @param orderId
   * @returns the craft attempt id on success, or the reason it could not be fulfilled
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

    // Narrowed once: property narrowing does not survive into the
    // transaction closure below, so capture the non-null locals here.
    const {
      requester_actor_id: requesterActorId,
      world_id: worldId,
      recipe_id: recipeId,
      offered_payment: offeredPayment,
      crafter_actor_id: crafterActorId,
    } = order;

    // One atomic unit: craft + payment + status flip run in a single
    // transaction. The order row is claimed (accepted → fulfilling) with a
    // conditional predicate as the FIRST write, so a concurrent fulfil
    // matches zero rows and fails before any side effect. A crash after the
    // claim throws, and Kysely rolls the craft and payment back with it —
    // previously each leg committed separately and a mid-sequence failure
    // stranded crafted-but-unpaid (or paid-but-unflipped) state.
    // (BUG-service-layer-multi-query-mutations-run-without-transactions).
    try {
      const outcome = await withTransaction(this.db, async (trx,) => {
        // Claim before any side effect: flip accepted → fulfilling only
        // while the row still carries `accepted`. Raw SQL +
        // numAffectedRows per the repo's CAS pattern
        // (src/db/optimistic-locking.ts) — the Kysely query builder's
        // UpdateResult does not surface affected rows on this driver.
        const claim = await sql`
          update ${sql.table("crafting_orders",)}
          set status = ${"fulfilling"}, updated_at = ${new Date().toISOString()}
          where ${sql.ref("id",)} = ${orderId} and ${sql.ref("status",)} = ${"accepted"}
        `.execute(trx,);

        if (Number(claim.numAffectedRows,) === 0) {
          return {
            ok: false as const,
            reason: "order is no longer accepted (already fulfilled, cancelled, or being fulfilled)",
          };
        }

        const craft = new CraftingProcessService(trx,);
        const trade = new TradeService(trx,);

        let attempt: CraftResult;
        try {
          attempt = await craft.attemptCraft({
            actorId: requesterActorId,
            worldId,
            recipeId,
          },);
        } catch (error) {
          throw new FulfillAbortError(error instanceof Error ? error.message : String(error,),);
        }

        if (offeredPayment > 0) {
          const paid = await trade.trade({
            worldId,
            buyerActorId: requesterActorId,
            sellerActorId: crafterActorId,
            buyerItems: [],
            sellerItems: [],
            price: offeredPayment,
          },);

          if (!paid.success) {
            throw new FulfillAbortError(paid.reason ?? "payment failed",);
          }
        }

        const flipped = await trx.updateTable("crafting_orders",)
          .set({ status: "fulfilled", updated_at: new Date().toISOString(), },)
          .where("id", "=", orderId,)
          .where("status", "=", "fulfilling",)
          .executeTakeFirst();

        if (Number(flipped?.numUpdatedRows ?? 0,) === 0) {
          throw new FulfillAbortError("order left the fulfilling state mid-fulfil",);
        }

        return { ok: true as const, attemptId: attempt.attemptId, };
      },);

      if (!outcome.ok) { return outcome; }

      return { ok: true, attemptId: outcome.attemptId, };
    } catch (error) {
      // Post-claim failure throws, so the transaction rolls back the craft
      // and payment with it; the order is untouched (still `accepted`) and
      // retryable, and cancelOrder (open|accepted) stays reachable.
      if (error instanceof FulfillAbortError) { return { ok: false, reason: error.message, }; }
      throw error;
    }
  }

  /**
   * Requester cancels an order that is still `open` or `accepted`.
   * @param orderId
   * @param actorId
   * @returns true when the requester's order was cancelled
   */
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

  /**
   * Map a `crafting_orders` row to the service-level {@link CraftingOrder}.
   * @param r
   */
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
