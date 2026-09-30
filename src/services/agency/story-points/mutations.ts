// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Story points — earn / spend / set cap. Pure-Kysely SQL with a
 * conditional UPDATE for concurrency-safe spend.
 *
 * @module services/agency/story-points/mutations
 */
import { type Kysely, sql, } from "kysely";
import type { DB, } from "../../../db";
import { refreshActorStoryPointsCache, } from "../actor-story-points-cache";
import { getStoryPointBalance, } from "./queries";
import {
  assertValidAmount,
  CapExceededError,
  InsufficientStoryPointsError,
  type StoryPointChange,
  type StoryPointLedger,
} from "./types";

/**
 * Atomically credit story points to an actor; `earned_total` is monotonic.
 *
 * Concurrency: the whole read-decide-write runs in one transaction, the
 * UPDATE is relative (`balance = balance + ?`) rather than an absolute write
 * of a value computed from a possibly-stale read, and the first-time INSERT
 * is `ON CONFLICT DO NOTHING` against 020's partial unique index so a losing
 * concurrent earn falls through to the UPDATE instead of raising a raw
 * SQLITE UNIQUE violation. BUG-earnstorypoints-lost-update-race-and-raw-unique-violation-on
 * @throws CapExceededError when a cap is set and the earn cannot fit under it.
 */
export async function earnStoryPoints(
  db: Kysely<DB>,
  params: StoryPointChange,
): Promise<StoryPointLedger> {
  assertValidAmount(params.amount,);
  const worldKey = params.worldId ?? null;
  const ledgerId = sql<string>`lower(hex(randomblob(16)))`;

  await db.transaction().execute(async (trx,) => {
    // 020 splits the uniqueness into two partial indexes: one for a NULL
    // world_id and one for a set world_id, so the conflict target has to
    // match the shape of the row being written.
    const conflictTarget = worldKey === null
      ? sql`(actor_id) WHERE world_id IS NULL`
      : sql`(actor_id, world_id) WHERE world_id IS NOT NULL`;

    const insert = await sql`
      INSERT INTO actor_story_points (
        id, actor_id, world_id, balance, earned_total, spent_total,
        cap, last_earn_at, last_earn_reason, created_at, updated_at
      )
      VALUES (
        ${ledgerId}, ${params.actorId}, ${worldKey}, ${params.amount}, ${params.amount}, 0,
        NULL, datetime('now'), ${params.reason ?? null}, datetime('now'), datetime('now')
      )
      ON CONFLICT ${conflictTarget} DO NOTHING
    `.execute(trx,);

    // A concurrent earn that inserted first leaves zero rows affected here;
    // that earn already credits this actor, so fall through to the UPDATE
    // rather than reporting an error.
    if (Number(insert.numAffectedRows ?? 0n,) === 0) {
      const existing = await trx
        .selectFrom("actor_story_points",)
        .select(["balance", "cap",],)
        .where("actor_id", "=", params.actorId,)
        .where("world_id", "is", worldKey,)
        .executeTakeFirst();

      if (existing === undefined) {
        // The row was deleted between the INSERT and here. Nothing to credit.
        return;
      }

      if (existing.cap !== null && existing.balance + params.amount > existing.cap) {
        // Cap check inside the transaction so a concurrent cap change or
        // earn cannot open a window between the read and the write.
        throw new CapExceededError(params.actorId, params.amount, existing.cap,);
      }

      // Relative update: the new balance is computed by SQLite from the value
      // it holds at write time, not from a read that may already be stale.
      // The cap is re-applied here so the relative add cannot overshoot it.
      await sql`
        UPDATE actor_story_points
        SET
          balance = MIN(
            COALESCE(cap, balance + ${params.amount}),
            balance + ${params.amount}
          ),
          earned_total = earned_total + ${params.amount},
          last_earn_at = datetime('now'),
          last_earn_reason = ${params.reason ?? null},
          updated_at = datetime('now')
        WHERE actor_id = ${params.actorId}
          AND world_id IS ${worldKey}
      `.execute(trx,);
    }
  },);

  const after = await getStoryPointBalance(db, params.actorId, worldKey,);
  // Fire-and-forget cache refresh — caller never blocks on this.
  void refreshActorStoryPointsCache(db, params.actorId, worldKey,).catch(() => {/* swallow */},);
  return {
    ...after,
    ledger_id: ledgerId.toString(),
    amount: params.amount,
    reason: params.reason ?? null,
    kind: "earn",
  };
}

/** Atomically debit story points; refuses when balance would go negative. */
export async function spendStoryPoints(
  db: Kysely<DB>,
  params: StoryPointChange,
): Promise<StoryPointLedger> {
  assertValidAmount(params.amount,);
  const worldKey = params.worldId ?? null;
  const ledgerId = sql<string>`lower(hex(randomblob(16)))`;

  const existing = await db
    .selectFrom("actor_story_points",)
    .select(["id", "balance",],)
    .where("actor_id", "=", params.actorId,)
    .where("world_id", "is", worldKey,)
    .executeTakeFirst();

  if (existing === undefined) {
    // First-time spend → zero balance → always insufficient.
    await sql`
      INSERT INTO actor_story_points (
        id, actor_id, world_id, balance, earned_total, spent_total, cap,
        created_at, updated_at
      )
      VALUES (
        ${ledgerId}, ${params.actorId}, ${worldKey}, 0, 0, 0, NULL,
        datetime('now'), datetime('now')
      )
    `.execute(db,);
    throw new InsufficientStoryPointsError(params.actorId, params.amount, 0,);
  }

  // Conditional UPDATE: the WHERE clause includes `balance >= amount`
  // so a concurrent spend that drains the balance will leave zero rows
  // touched. Read numAffectedRows from the raw result -- 0 means the
  // conditional UPDATE missed (insufficient or concurrent winner).
  const updateResult = await sql`
    UPDATE actor_story_points
    SET
      balance = balance - ${params.amount},
      spent_total = spent_total + ${params.amount},
      last_spend_at = datetime('now'),
      last_spend_reason = ${params.reason ?? null},
      updated_at = datetime('now')
    WHERE id = ${existing.id}
      AND balance >= ${params.amount}
  `.execute(db,);

  const affected = Number(updateResult.numAffectedRows ?? 0n,);
  if (affected === 0) {
    const bal = await getStoryPointBalance(db, params.actorId, worldKey,);
    throw new InsufficientStoryPointsError(
      params.actorId,
      params.amount,
      bal.balance,
    );
  }

  const after = await getStoryPointBalance(db, params.actorId, worldKey,);
  void refreshActorStoryPointsCache(db, params.actorId, worldKey,).catch(() => {/* swallow */},);
  return {
    ...after,
    ledger_id: ledgerId.toString(),
    amount: params.amount,
    reason: params.reason ?? null,
    kind: "spend",
  };
}

/** Set or clear the per-actor story-point cap. Pass `null` to clear. */
export async function setStoryPointCap(
  db: Kysely<DB>,
  actorId: string,
  worldId: string | null | undefined,
  cap: number | null,
): Promise<void> {
  if (cap !== null) { assertValidAmount(cap,); }
  const worldKey = worldId ?? null;

  const existing = await db
    .selectFrom("actor_story_points",)
    .select("id",)
    .where("actor_id", "=", actorId,)
    .where("world_id", "is", worldKey,)
    .executeTakeFirst();

  if (existing === undefined) {
    await sql`
      INSERT INTO actor_story_points (
        id, actor_id, world_id, balance, earned_total, spent_total, cap, created_at, updated_at
      )
      VALUES (
        lower(hex(randomblob(16))), ${actorId}, ${worldKey}, 0, 0, 0, ${cap}, datetime('now'), datetime('now')
      )
    `.execute(db,);
    return;
  }

  await sql`
    UPDATE actor_story_points
    SET cap = ${cap}, updated_at = datetime('now')
    WHERE id = ${existing.id}
  `.execute(db,);
}
