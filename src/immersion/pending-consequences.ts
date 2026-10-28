// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Immersion Gate - failed-check consequence store (WI-3).
 *
 * Persistent pending-consequence state over `immersion_failed_checks`:
 * battle/dice outcomes that failed record a constraint here, and the
 * gate's default `PendingConsequenceLoader` reads open rows so follow-up
 * claims referencing the failed action are flagged until a narrative beat
 * resolves them.
 *
 * Producer seam (documented, not yet wired): today's battle resolution
 * checks (`src/battle/resolution-integration/checks.ts`) and dice rolls
 * (`src/rpg/dice`) are pure - they return `success` to their caller but
 * no runtime site persists per-actor failures. When such call sites gain
 * actor context, they call {@link recordFailedCheck}; the swap to
 * `epic-player-state-machine` state later replaces the table read, not
 * this API.
 */
import { type Kysely, } from "kysely";

import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import type { PendingConsequenceLoader, } from "./engine";
import type { PendingConsequence, } from "./types";

/** Where the failed check originated (audit/attribution vocabulary). */
export type FailedCheckSource = "battle" | "dice" | "manual";

/**
 * Maximum open consequences loaded per actor chat. Bounds the snapshot
 * (and therefore the deterministic evaluation) for hoarded failures.
 */
export const MAX_PENDING_CONSEQUENCES = 8;

/** Arguments for {@link recordFailedCheck}. */
export interface RecordFailedCheckArgs {
  /** Chat the failed check happened in. */
  readonly chatId: string;
  /** Actor whose check failed. */
  readonly actorId: string;
  /** Action/skill/item keyword the failure constrains (normalized to lowercase). */
  readonly blockedAction: string;
  /** Human-readable failure reason surfaced in gate findings. */
  readonly reason: string;
  /** Origin of the failed check. */
  readonly source: FailedCheckSource;
}

/**
 * Record one unresolved failed-check consequence.
 * @param {Kysely<DB>} db
 * @param {RecordFailedCheckArgs} args
 * @returns {Promise<string>} The consequence id (the audit anchor).
 * @throws when the insert fails (database error propagates).
 */
export async function recordFailedCheck(
  db: Kysely<DB>,
  args: RecordFailedCheckArgs,
): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .insertInto("immersion_failed_checks",)
    .values({
      id,
      chat_id: args.chatId,
      actor_id: args.actorId,
      blocked_action: args.blockedAction.trim().toLowerCase(),
      reason: args.reason,
      source: args.source,
    },)
    .execute();

  try {
    getLogger().child({ module: "immersion-gate", },).debug(`recorded failed check ${id}`, {
      chatId: args.chatId,
      actorId: args.actorId,
      blockedAction: args.blockedAction,
      source: args.source,
    },);
  } catch {
    // Logging must never fail the record.
  }

  return id;
}

/**
 * Load open (unresolved) consequences for one actor in one chat, oldest
 * first, capped at {@link MAX_PENDING_CONSEQUENCES}.
 * @param {Kysely<DB>} db
 * @param {object} args
 * @param {string} args.chatId
 * @param {string} args.actorId
 * @returns {Promise<readonly PendingConsequence[]>}
 */
export async function loadOpenFailedChecks(
  db: Kysely<DB>,
  args: {
    readonly chatId: string;
    readonly actorId: string;
  },
): Promise<readonly PendingConsequence[]> {
  const rows = await db
    .selectFrom("immersion_failed_checks",)
    .select(["id", "blocked_action", "reason",],)
    .where("chat_id", "=", args.chatId,)
    .where("actor_id", "=", args.actorId,)
    .where("resolved_at", "is", null,)
    .orderBy("created_at", "asc",)
    .orderBy("id", "asc",)
    .limit(MAX_PENDING_CONSEQUENCES,)
    .execute();

  return rows.map((row,) => ({
    id: row.id,
    blockedAction: row.blocked_action,
    reason: row.reason,
  }));
}

/**
 * Resolve one open consequence (the constrained action was narrated as
 * failing, or the GM/battle flow retired it).
 * @param {Kysely<DB>} db
 * @param {string} id
 * @returns {Promise<boolean>} Whether an open row was resolved.
 */
export async function resolveFailedCheck(db: Kysely<DB>, id: string,): Promise<boolean> {
  const result = await db
    .updateTable("immersion_failed_checks",)
    .set({ resolved_at: sqlNow(), },)
    .where("id", "=", id,)
    .where("resolved_at", "is", null,)
    .executeTakeFirst();

  return Number(result?.numUpdatedRows ?? 0,) > 0;
}

/**
 * DB-backed default loader: wire as
 * `createImmersionGate({ db })` and pending failed checks constrain
 * follow-up claims with no extra configuration.
 * @param {Kysely<DB>} db
 * @returns {PendingConsequenceLoader}
 */
export function dbPendingConsequenceLoader(db: Kysely<DB>,): PendingConsequenceLoader {
  return (input,) => loadOpenFailedChecks(db, { chatId: input.chatId, actorId: input.actorId, },);
}

/** SQLite `datetime('now')` as the resolved-at stamp (matches the column default style). */
function sqlNow(): string {
  return new Date().toISOString().replace("T", " ",).replace(/\.\d{3}Z$/, "",);
}
