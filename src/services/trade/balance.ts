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
 * @returns {Promise<number>}
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

  // Atomic guard (uq_actor_currencies_actor_world_currency, migration 079):
  // a concurrent ensure that wins the insert race turns this insert into a
  // no-op, and the re-read below returns the winner's row — previously the
  // raced pair inserted two ledger rows.
  await db
    .insertInto("actor_currencies",)
    .values({
      id: uid(),
      actor_id: actorId,
      world_id: worldId,
      currency_type: currency,
      balance: 0,
    },)
    .onConflict((oc,) => oc.columns(["actor_id", "world_id", "currency_type",],).doNothing())
    .execute();

  const winner = await db
    .selectFrom("actor_currencies",)
    .select("balance",)
    .where("actor_id", "=", actorId,)
    .where("world_id", "=", worldId,)
    .where("currency_type", "=", currency,)
    .executeTakeFirst();

  return winner?.balance ?? 0;
}

/**
 * Current gold (or other currency) balance for an actor in a world.
 * @param db
 * @param actorId
 * @param worldId
 * @param currency
 * @returns {Promise<number>}
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
 * Thrown when a concurrent writer wins the balance race on every bounded
 * attempt, so no attempt could re-read a pre-image it still matched.
 */
class BalanceWriteExhaustedError extends Error {
  /** @param message - Human-readable failure description. */
  constructor(message: string,) {
    super(message,);
    this.name = "BalanceWriteExhaustedError";
  }
}

const MAX_BALANCE_WRITE_ATTEMPTS = 4;

/**
 * Conditional balance write. `next` sees the observed pre-image and returns
 * the new balance, or null for a no-op (insufficient funds). A writer that
 * loses the race re-reads the row and recomputes from the fresh balance.
 */
async function applyBalanceUpdate(
  d: Kysely<DB> | Transaction<DB>,
  actorId: string,
  worldId: string,
  currency: string,
  next: (current: number,) => number | null,
): Promise<number | null> {
  for (let attempt = 0; attempt < MAX_BALANCE_WRITE_ATTEMPTS; attempt++) {
    const current = await ensureBalanceRow(d, actorId, worldId, currency,);
    const updated = next(current,);
    if (updated === null) { return null; }

    const result = await d
      .updateTable("actor_currencies",)
      .set({ balance: updated, updated_at: new Date().toISOString(), },)
      .where("actor_id", "=", actorId,)
      .where("world_id", "=", worldId,)
      .where("currency_type", "=", currency,)
      .where("balance", "=", current,)
      .executeTakeFirst();

    if (Number(result.numUpdatedRows ?? 0,) > 0) { return updated; }
  }

  throw new BalanceWriteExhaustedError(
    `balance update for ${actorId}/${worldId}/${currency} failed after ${MAX_BALANCE_WRITE_ATTEMPTS} attempts: concurrent modification`,
  );
}

/**
 * Add funds to an actor's balance (never produces a negative balance).
 * The write is conditional on the balance read at the top of the attempt; a
 * concurrent writer that changed the row between read and write turns the
 * UPDATE into a 0-rows no-op and the attempt is retried from a freshly-read
 * balance (bounded), so a retry can never double-apply the credit.
 * @param db
 * @param actorId
 * @param worldId
 * @param amount
 * @param currency
 * @param trx
 * @throws {BalanceWriteExhaustedError} when every bounded attempt loses the
 * race to a concurrent writer.
 * @throws {Error} on negative amount.
 * @returns {Promise<number>} the balance written by the winning attempt.
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
  return (await applyBalanceUpdate(
    trx ?? db,
    actorId,
    worldId,
    currency,
    (current,) => current + amount,
  ))!;
}

/**
 * Remove funds; returns false (no-op) when insufficient.
 * @param db
 * @param actorId
 * @param worldId
 * @param amount
 * @param currency
 * @param trx
 * @throws {Error}
 * @returns {Promise<boolean>}
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
  try {
    const updated = await applyBalanceUpdate(
      trx ?? db,
      actorId,
      worldId,
      currency,
      (current,) => current < amount ? null : current - amount,
    );

    return updated !== null;
  } catch (e) {
    // Documented failure mode: race exhaustion reports a retryable no-op
    // instead of throwing, so callers treat it like insufficient funds.
    if (e instanceof BalanceWriteExhaustedError) { return false; }
    throw e;
  }
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
 * @returns {Promise<boolean>}
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
