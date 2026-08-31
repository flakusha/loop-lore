// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Currency balance operations for the trade service.
 *
 * Balance ledger in `actor_currencies` — DENORMALIZED integers, never negative.
 */
import type { Kysely, Transaction, } from "kysely";
import type { DB, } from "../../db/schema";
import { uid, } from "../../utils";
import { DEFAULT_CURRENCY, } from "./types";

/**
 * Resolve or create a currency balance row for an actor+world.
 * Returns the current balance (0 when absent) and upserts a row.
 * @param db
 * @param actorId
 * @param worldId
 * @param currency
 */
export async function ensureBalanceRow(
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

/**
 * Current gold (or other currency) balance for an actor in a world.
 * @param db
 * @param actorId
 * @param worldId
 * @param currency
 */
export async function getBalance(
  db: Kysely<DB>,
  actorId: string,
  worldId: string,
  currency: string = DEFAULT_CURRENCY,
): Promise<number> {
  const row = await db
    .selectFrom("actor_currencies",)
    .select("balance",)
    .where("actor_id", "=", actorId,)
    .where("world_id", "=", worldId,)
    .where("currency_type", "=", currency,)
    .executeTakeFirst();
  return row?.balance ?? 0;
}

/**
 * Add funds to an actor's balance (never produces a negative balance).
 * @param db
 * @param actorId
 * @param worldId
 * @param amount
 * @param currency
 * @param trx
 */
export async function credit(
  db: Kysely<DB>,
  actorId: string,
  worldId: string,
  amount: number,
  currency: string = DEFAULT_CURRENCY,
  trx?: Kysely<DB> | Transaction<DB>,
): Promise<number> {
  if (amount < 0) { throw new Error("credit amount must be non-negative",); }
  const d = trx ?? db;
  const current = await ensureBalanceRow(d, actorId, worldId, currency,);
  const next = current + amount;
  await d
    .updateTable("actor_currencies",)
    .set({ balance: next, updated_at: new Date().toISOString(), },)
    .where("actor_id", "=", actorId,)
    .where("world_id", "=", worldId,)
    .where("currency_type", "=", currency,)
    .execute();
  return next;
}

/**
 * Remove funds; returns false (no-op) when insufficient.
 * @param db
 * @param actorId
 * @param worldId
 * @param amount
 * @param currency
 * @param trx
 */
export async function debit(
  db: Kysely<DB>,
  actorId: string,
  worldId: string,
  amount: number,
  currency: string = DEFAULT_CURRENCY,
  trx?: Kysely<DB> | Transaction<DB>,
): Promise<boolean> {
  if (amount < 0) { throw new Error("debit amount must be non-negative",); }
  const d = trx ?? db;
  const current = await ensureBalanceRow(d, actorId, worldId, currency,);
  if (current < amount) { return false; }
  const next = current - amount;
  await d
    .updateTable("actor_currencies",)
    .set({ balance: next, updated_at: new Date().toISOString(), },)
    .where("actor_id", "=", actorId,)
    .where("world_id", "=", worldId,)
    .where("currency_type", "=", currency,)
    .execute();
  return true;
}

/**
 * Move gold atomically from one actor to another. Returns false when from lacks funds.
 * @param db
 * @param fromActorId
 * @param toActorId
 * @param worldId
 * @param amount
 * @param currency
 * @param trx
 */
export async function transferCurrency(
  db: Kysely<DB>,
  fromActorId: string,
  toActorId: string,
  worldId: string,
  amount: number,
  currency: string = DEFAULT_CURRENCY,
  trx?: Kysely<DB> | Transaction<DB>,
): Promise<boolean> {
  if (amount <= 0) { return true; }
  const d = trx ?? db;
  const ok = await debit(db, fromActorId, worldId, amount, currency, d,);
  if (!ok) { return false; }
  await credit(db, toActorId, worldId, amount, currency, d,);
  return true;
}
