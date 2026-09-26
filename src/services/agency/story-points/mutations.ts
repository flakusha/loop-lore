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

/** Helper: raw balance-only read (no upsert). */
async function readBalanceRow(
  db: Kysely<DB>,
  actorId: string,
  worldKey: string | null,
): Promise<{ balance: number }> {
  const row = await db
    .selectFrom("actor_story_points",)
    .select("balance",)
    .where("actor_id", "=", actorId,)
    .where("world_id", "is", worldKey,)
    .executeTakeFirst();
  return { balance: row?.balance ?? 0, };
}

/** Atomically credit story points to an actor; `earned_total` is monotonic. */
export async function earnStoryPoints(
  db: Kysely<DB>,
  params: StoryPointChange,
): Promise<StoryPointLedger> {
  assertValidAmount(params.amount,);
  const worldKey = params.worldId ?? null;
  const ledgerId = sql<string>`lower(hex(randomblob(16)))`;

  // SQLite UNIQUE treats NULL world_id as distinct — manage upsert manually.
  const existing = await db
    .selectFrom("actor_story_points",)
    .select(["id", "balance", "earned_total", "cap",],)
    .where("actor_id", "=", params.actorId,)
    .where("world_id", "is", worldKey,)
    .executeTakeFirst();

  if (existing === undefined) {
    await sql`
      INSERT INTO actor_story_points (
        id, actor_id, world_id, balance, earned_total, spent_total,
        cap, last_earn_at, last_earn_reason, created_at, updated_at
      )
      VALUES (
        ${ledgerId}, ${params.actorId}, ${worldKey}, ${params.amount}, ${params.amount}, 0,
        NULL, datetime('now'), ${params.reason ?? null}, datetime('now'), datetime('now')
      )
    `.execute(db,);
  } else {
    const newBalance = existing.cap === null
      ? existing.balance + params.amount
      : Math.min(existing.cap, existing.balance + params.amount,);
    if (existing.cap !== null && newBalance === existing.balance && params.amount > 0) {
      // Cap already saturated — refuse rather than silently clamping.
      throw new CapExceededError(params.actorId, params.amount, existing.cap,);
    }
    await sql`
      UPDATE actor_story_points
      SET
        balance = ${newBalance},
        earned_total = earned_total + ${params.amount},
        last_earn_at = datetime('now'),
        last_earn_reason = ${params.reason ?? null},
        updated_at = datetime('now')
      WHERE id = ${existing.id}
    `.execute(db,);
  }

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

  const affected = (updateResult as unknown as { numAffectedRows?: number }).numAffectedRows ??
      (await readBalanceRow(db, params.actorId, worldKey,)).balance >= 0
    ? 1
    : 0;

  if (affected === 0) {
    const bal = await getStoryPointBalance(db, params.actorId, worldKey,);
    throw new InsufficientStoryPointsError(params.actorId, params.amount, bal.balance,);
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
