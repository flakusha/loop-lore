/**
 * Trade Service
 *
 * Player↔player and player↔NPC trading with gold/currency exchange,
 * layered over `ItemsService` for item transfer and an `actor_currencies`
 * balance ledger per world.
 *
 *   getBalance(actorId, worldId[, currency="gold"])
 *   credit(actorId, worldId, amount[, currency])     — add funds (never negative)
 *   debit(actorId, worldId, amount[, currency])      — remove funds (validates funds)
 *   transferCurrency(from, to, worldId, amount[, currency]) — atomic ledger move
 *   trade(...)                                       — atomic items+gold both directions
 *
 * All writes are transactional. Currency balances are DENORMALIZED integers
 * in `actor_currencies.balance` (never negative, CHECK-constrained).
 */
import type { Kysely, Transaction, } from "kysely";
import type { DB, } from "../db/schema";
import { ItemsService, } from "../story/items";
import { uid, } from "../utils";

export const DEFAULT_CURRENCY = "gold" as const;

export interface TradeResult {
  success: boolean;
  reason?: string;
  /** Currency moved from buyer to seller. */
  pricePaid?: number;
  /** Item instance IDs moved in each direction. */
  itemsOffered?: string[];
  itemsRequested?: string[];
}

export interface TradeLine {
  worldItemId: string;
  quantity: number;
}

/**
 * Resolve or create a currency balance row for an actor+world.
 * Returns the current balance (0 when absent) and upserts a row.
 */
async function ensureBalanceRow(
  db: Kysely<DB>,
  actorId: string,
  worldId: string,
  currency: string,
): Promise<number> {
  const existing = await db
    .selectFrom("actor_currencies",)
    .select("balance",)
    .where("actor_id", "=", actorId,)
    .where("world_id", "=", worldId,)
    .where("currency_type", "=", currency,)
    .executeTakeFirst();

  if (existing) { return existing.balance; }

  await db
    .insertInto("actor_currencies",)
    .values({
      id: uid(),
      actor_id: actorId,
      world_id: worldId,
      currency_type: currency,
      balance: 0,
    },)
    .execute();
  return 0;
}

export class TradeService {
  private readonly items: ItemsService;

  constructor(private readonly db: Kysely<DB>,) {
    this.items = new ItemsService(db,);
  }

  /** Current gold (or other currency) balance for an actor in a world. */
  async getBalance(
    actorId: string,
    worldId: string,
    currency: string = DEFAULT_CURRENCY,
  ): Promise<number> {
    const row = await this.db
      .selectFrom("actor_currencies",)
      .select("balance",)
      .where("actor_id", "=", actorId,)
      .where("world_id", "=", worldId,)
      .where("currency_type", "=", currency,)
      .executeTakeFirst();
    return row?.balance ?? 0;
  }

  /** Add funds to an actor's balance (never produces a negative balance). */
  async credit(
    actorId: string,
    worldId: string,
    amount: number,
    currency: string = DEFAULT_CURRENCY,
    trx?: Kysely<DB> | Transaction<DB>,
  ): Promise<number> {
    if (amount < 0) { throw new Error("credit amount must be non-negative",); }
    const db = trx ?? this.db;
    const current = await ensureBalanceRow(db, actorId, worldId, currency,);
    const next = current + amount;
    await db
      .updateTable("actor_currencies",)
      .set({ balance: next, updated_at: new Date().toISOString(), },)
      .where("actor_id", "=", actorId,)
      .where("world_id", "=", worldId,)
      .where("currency_type", "=", currency,)
      .execute();
    return next;
  }

  /** Remove funds; returns false (no-op) when insufficient. */
  async debit(
    actorId: string,
    worldId: string,
    amount: number,
    currency: string = DEFAULT_CURRENCY,
    trx?: Kysely<DB> | Transaction<DB>,
  ): Promise<boolean> {
    if (amount < 0) { throw new Error("debit amount must be non-negative",); }
    const db = trx ?? this.db;
    const current = await ensureBalanceRow(db, actorId, worldId, currency,);
    if (current < amount) { return false; }
    const next = current - amount;
    await db
      .updateTable("actor_currencies",)
      .set({ balance: next, updated_at: new Date().toISOString(), },)
      .where("actor_id", "=", actorId,)
      .where("world_id", "=", worldId,)
      .where("currency_type", "=", currency,)
      .execute();
    return true;
  }

  /** Move gold atomically from one actor to another. Returns false when from lacks funds. */
  async transferCurrency(
    fromActorId: string,
    toActorId: string,
    worldId: string,
    amount: number,
    currency: string = DEFAULT_CURRENCY,
    trx?: Kysely<DB> | Transaction<DB>,
  ): Promise<boolean> {
    if (amount <= 0) { return true; } // nothing to move
    const db = trx ?? this.db;
    const ok = await this.debit(fromActorId, worldId, amount, currency, db,);
    if (!ok) { return false; }
    await this.credit(toActorId, worldId, amount, currency, db,);
    return true;
  }

  /**
   * Execute a two-sided trade atomically between two actors:
   *   buyer pays `price` gold + `buyerItems` → seller
   *   seller sends `sellerItems` → buyer
   *
   * `buyer` and `seller` are explicit actor IDs; every item line must be
   * owned by the stated party and hold sufficient quantity. Item transfers
   * (owner→owner) and the currency ledger commit in one transaction — on
   * any validation failure nothing is written.
   */
  async trade(opts: {
    worldId: string;
    buyerActorId: string;
    sellerActorId: string;
    buyerItems: TradeLine[];
    sellerItems: TradeLine[];
    price: number;
  },): Promise<TradeResult> {
    const { worldId, buyerActorId, sellerActorId, buyerItems, sellerItems, price, } = opts;
    if (buyerActorId === sellerActorId) {
      return { success: false, reason: "cannot trade with yourself", };
    }

    // Validate every offered line is owned and sufficiently stocked.
    const validateLines = async (db: Kysely<DB>, actorId: string, lines: TradeLine[],): Promise<string | null> => {
      for (const line of lines) {
        const row = await db
          .selectFrom("world_items",)
          .select(["owner_actor_id", "quantity",],)
          .where("id", "=", line.worldItemId,)
          .executeTakeFirst();
        if (!row) { return `item ${line.worldItemId} not found`; }
        if (row.owner_actor_id !== actorId) { return `item ${line.worldItemId} not owned by intended party`; }
        if (row.quantity < line.quantity) { return `insufficient quantity for ${line.worldItemId}`; }
      }
      return null;
    };

    const preErr = (await validateLines(this.db, buyerActorId, buyerItems,)) ??
      (await validateLines(this.db, sellerActorId, sellerItems,));
    if (preErr) { return { success: false, reason: preErr, }; }

    let success = false;
    const moved: { pricePaid: number; itemsOffered: string[]; itemsRequested: string[] } = {
      pricePaid: 0,
      itemsOffered: [],
      itemsRequested: [],
    };
    let reason: string | undefined;

    await this.db.transaction().execute(async (trx,) => {
      // Currency: buyer pays seller.
      const paid = await this.debit(buyerActorId, worldId, price, DEFAULT_CURRENCY, trx,);
      if (!paid) {
        reason = "buyer has insufficient currency";
        return;
      }
      await this.credit(sellerActorId, worldId, price, DEFAULT_CURRENCY, trx,);
      moved.pricePaid = price;

      // Items: buyer's → seller; seller's → buyer.
      for (const line of buyerItems) {
        const res = await this.items.transfer(line.worldItemId, line.quantity, undefined, sellerActorId, trx,);
        if (!res.success) {
          reason = "buyer item transfer failed";
          return;
        }
        moved.itemsOffered.push(line.worldItemId,);
      }
      for (const line of sellerItems) {
        const res = await this.items.transfer(line.worldItemId, line.quantity, undefined, buyerActorId, trx,);
        if (!res.success) {
          reason = "seller item transfer failed";
          return;
        }
        moved.itemsRequested.push(line.worldItemId,);
      }
      success = true;
    },);

    return success ? { success: true, ...moved, } : { success: false, reason, };
  }
}
