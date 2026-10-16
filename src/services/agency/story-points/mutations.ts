// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Story points — earn / spend / set cap. Pure-Kysely SQL with a
 * conditional UPDATE for concurrency-safe spend.
 *
 * @module services/agency/story-points/mutations
 */
import { type Kysely, sql, } from "kysely";
import { randomBytes, } from "node:crypto";
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
 * SQLITE UNIQUE violation.
 *
 * Cap behaviour changed: an earn is now refused whenever
 * `balance + amount > cap`, where before it was refused only at full
 * saturation and a partial overflow was silently clamped to the cap. The
 * clamp also left `earned_total` counting the refused amount, breaking
 * `balance = earned - spent`; refusing keeps the invariant.
 *
 * @param db
 * @param params
 * @returns the ledger row for the credited points.
 * @throws CapExceededError when a cap is set and the earn would exceed it.
 * @throws InvalidAmountError when `amount` is not a positive integer.
 */
export async function earnStoryPoints(
  db: Kysely<DB>,
  params: StoryPointChange,
): Promise<StoryPointLedger> {
  assertValidAmount(params.amount,);
  const worldKey = params.worldId ?? null;
  // Generated in JS so the id is known to the caller; a RawBuilder here would
  // interpolate as SQL text and .toString() would return the SQL, not an id.
  const ledgerId = randomBytes(16,).toString("hex",);
  // The row's id is fixed at first insert; on any DO-NOTHING path the stored
  // id — not this call's freshly generated one — must be reported.
  let storedId = ledgerId;

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
        .select(["id", "balance", "cap",],)
        .where("actor_id", "=", params.actorId,)
        .where("world_id", "is", worldKey,)
        .executeTakeFirst();

      if (existing === undefined) {
        // The row was deleted between the INSERT and here. Nothing to credit.
        return;
      }

      // A concurrent earn inserted first: the stored row's id — not the id
      // this call generated — is the ledger id to report.
      storedId = existing.id;

      if (existing.cap !== null && existing.balance + params.amount > existing.cap) {
        // Cap check inside the transaction so a concurrent cap change or
        // earn cannot open a window between the read and the write.
        throw new CapExceededError(params.actorId, params.amount, existing.cap,);
      }

      // Relative update: SQLite computes the new balance from the value it
      // holds at write time, not from the read above, which a concurrent earn
      // may already have moved. The cap needs no re-application here — the
      // guard above refuses any earn where balance + amount > cap, so by the
      // time this statement runs the add is known to fit.
      await sql`
        UPDATE actor_story_points
        SET
          balance = balance + ${params.amount},
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
  void refreshActorStoryPointsCache(db, params.actorId, worldKey,); // never rejects; logs its own failures
  return {
    ...after,
    ledger_id: storedId,
    amount: params.amount,
    reason: params.reason ?? null,
    kind: "earn",
  };
}

/**
 * Atomically debit story points; refuses when balance would go negative.
 *
 * The first-time INSERT is `ON CONFLICT DO NOTHING` against 020's partial
 * unique index for the same reason as in `earnStoryPoints`: concurrent
 * first-time spends all reach the INSERT, and without the conflict clause
 * the losers raised a raw `SQLITE_CONSTRAINT` instead of the intended
 * `InsufficientStoryPointsError`. A losing INSERT falls through to the
 * conditional UPDATE below, which reports the insufficiency properly.
 * @param db
 * @param params
 * @returns the ledger row for the debited points.
 * @throws InsufficientStoryPointsError when the balance cannot cover the amount.
 * @throws InvalidAmountError when `amount` is not a positive integer.
 */
export async function spendStoryPoints(
  db: Kysely<DB>,
  params: StoryPointChange,
): Promise<StoryPointLedger> {
  assertValidAmount(params.amount,);
  const worldKey = params.worldId ?? null;
  // Generated in JS so the id is known to the caller; a RawBuilder here would
  // interpolate as SQL text and .toString() would return the SQL, not an id.
  const ledgerId = randomBytes(16,).toString("hex",);
  // The row's id is fixed at first insert; on any DO-NOTHING path the stored
  // id — not this call's freshly generated one — must be reported.
  let storedId = ledgerId;

  await db.transaction().execute(async (trx,) => {
    const conflictTarget = worldKey === null
      ? sql`(actor_id) WHERE world_id IS NULL`
      : sql`(actor_id, world_id) WHERE world_id IS NOT NULL`;

    // Seed the row when absent. A zero balance is correct here: the spend
    // that follows decides whether it can proceed.
    await sql`
      INSERT INTO actor_story_points (
        id, actor_id, world_id, balance, earned_total, spent_total, cap,
        created_at, updated_at
      )
      VALUES (
        ${ledgerId}, ${params.actorId}, ${worldKey}, 0, 0, 0, NULL,
        datetime('now'), datetime('now')
      )
      ON CONFLICT ${conflictTarget} DO NOTHING
    `.execute(trx,);

    // Conditional UPDATE: `balance >= amount` means a concurrent spend that
    // drained the balance leaves zero rows touched, so the debit cannot go
    // negative. 0 affected rows means insufficient funds.
    const debited = await sql`
      UPDATE actor_story_points
      SET
        balance = balance - ${params.amount},
        spent_total = spent_total + ${params.amount},
        last_spend_at = datetime('now'),
        last_spend_reason = ${params.reason ?? null},
        updated_at = datetime('now')
      WHERE actor_id = ${params.actorId}
        AND world_id IS ${worldKey}
        AND balance >= ${params.amount}
    `.execute(trx,);

    if (Number(debited.numAffectedRows ?? 0n,) === 0) {
      // The INSERT above guarantees a row exists, so its balance is the
      // real figure to report — a first-time spend sees 0 here.
      const current = await trx
        .selectFrom("actor_story_points",)
        .select("balance",)
        .where("actor_id", "=", params.actorId,)
        .where("world_id", "is", worldKey,)
        .executeTakeFirst();

      // Throwing rolls the transaction back, so the seeded zero row is
      // undone along with the failed debit.
      throw new InsufficientStoryPointsError(
        params.actorId,
        params.amount,
        current?.balance ?? 0,
      );
    }

    // The debit touched exactly one row: read back its id so the response
    // reports the stored ledger id even when the spend's own INSERT was a
    // DO NOTHING (row created by an earlier earn).
    const row = await trx
      .selectFrom("actor_story_points",)
      .select("id",)
      .where("actor_id", "=", params.actorId,)
      .where("world_id", "is", worldKey,)
      .executeTakeFirst();

    if (row) { storedId = row.id; }
  },);

  const after = await getStoryPointBalance(db, params.actorId, worldKey,);
  void refreshActorStoryPointsCache(db, params.actorId, worldKey,); // never rejects; logs its own failures
  return {
    ...after,
    ledger_id: storedId,
    amount: params.amount,
    reason: params.reason ?? null,
    kind: "spend",
  };
}

/**
 * Set or clear the per-actor story-point cap. Pass `null` to clear.
 * @param {Kysely<DB>} db
 * @param {string} actorId
 * @param {string | null | undefined} worldId
 * @param {number | null} cap
 * @returns {Promise<void>}
 */
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
