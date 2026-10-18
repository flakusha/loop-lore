// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/federation/performance-quota-write.ts — the WRITE half of the operator
 * performance budget (migration `068_federation_performance_budgets.ts`).
 * `./performance-quota-store` already owns the read half; this module is its
 * only counterpart, so the admin panel persists a budget through the same
 * vocabulary the enforcement guard reads.
 *
 * Two invariants this file exists to hold:
 *
 *   1. A limit of `0` means BLOCK and `null` means UNLIMITED. They are distinct
 *      states, so the write never collapses one into the other. The read side
 *      (`positiveOrNull` in ./performance-quota-store) already drops a
 *      non-positive stored value back to `null`, so accepting `0` here would
 *      silently widen a block into unlimited — the exact collapse the epic
 *      forbids. A non-positive limit is therefore REJECTED, and clearing the
 *      field sends `null` to mean unlimited.
 *   2. The write REPLACES a cell rather than merging into it, so removing a
 *      limit in the panel actually removes it instead of leaving the previous
 *      number behind.
 */

import type { Kysely, } from "kysely";
import type { PeerBudgetMode, PeerWorkloadClass, } from "../db/enums";
import type { DB, } from "../db/schema";
import type { PerformanceBudget, } from "./performance-quota-types";

/** One budget cell as the panel submits it. */
export interface BudgetWriteInput {
  readonly origin: string;
  readonly workloadClass: PeerWorkloadClass;
  /** `advisory` counts and reports; `hard` also refuses. */
  readonly mode: PeerBudgetMode;
  /** Positive integer, or null for unlimited. */
  readonly maxConcurrency: number | null;
  /** Positive integer, or null for never-queue. */
  readonly maxQueueDepth: number | null;
  /** Positive integer, or null for unlimited. */
  readonly requestsPerMinute: number | null;
  /** ADVISORY only; never enforced. */
  readonly tokensPerMinute: number | null;
}

/** Why a submitted budget was refused. Branch on this, never on a message. */
export type BudgetRejection = "unknown_peer" | "negative_limit";

/** Typed rejection from the budget write path. Carries no secret. */
export class BudgetValidationError extends Error {
  override readonly name = "BudgetValidationError";

  /**
   * @param reason Machine-readable rejection reason.
   * @param message Human-readable detail naming the field.
   */
  constructor(public readonly reason: BudgetRejection, message: string,) {
    super(message,);
  }
}

/**
 * Every numeric limit is either absent (unlimited) or a POSITIVE integer. A
 * negative, fractional or zero value is a client bug, and accepting one would
 * widen a block into unlimited on the next read.
 *
 * @param value Submitted limit.
 * @param field Field name for the rejection message.
 * @returns {number | null}
 * @throws {BudgetValidationError}
 */
function normalizeLimit(value: number | null, field: string,): number | null {
  if (value === null) { return null; }
  if (!Number.isInteger(value,) || value <= 0) {
    throw new BudgetValidationError(
      "negative_limit",
      `${field} must be a positive integer, or null for unlimited (got ${value})`,
    );
  }

  return value;
}

/**
 * Persist one budget cell, replacing whatever was there.
 *
 * The peer FK is `ON DELETE CASCADE`, so an unknown origin is refused here
 * rather than surfacing as a raw foreign-key error from a driver the admin
 * surface should never be writing through.
 *
 * @param options
 * @param options.database
 * @param options.input The cell to store.
 * @returns {Promise<void>}
 * @throws {BudgetValidationError}
 */
export async function writePerformanceBudget(
  options: { database: Kysely<DB>; input: BudgetWriteInput },
): Promise<void> {
  const { database, input, } = options;

  const maxConcurrency = normalizeLimit(input.maxConcurrency, "maxConcurrency",);
  const maxQueueDepth = normalizeLimit(input.maxQueueDepth, "maxQueueDepth",);
  const requestsPerMinute = normalizeLimit(input.requestsPerMinute, "requestsPerMinute",);
  const tokensPerMinute = normalizeLimit(input.tokensPerMinute, "tokensPerMinute",);

  const peer = await database
    .selectFrom("mesh_peers",)
    .select("origin",)
    .where("origin", "=", input.origin,)
    .executeTakeFirst();

  if (peer === undefined) {
    throw new BudgetValidationError("unknown_peer", `unknown peer: ${input.origin}`,);
  }

  await database
    .insertInto("federation_performance_budgets",)
    .values({
      origin: input.origin,
      workload_class: input.workloadClass,
      budget_mode: input.mode,
      max_concurrency: maxConcurrency,
      max_queue_depth: maxQueueDepth,
      requests_per_minute: requestsPerMinute,
      tokens_per_minute: tokensPerMinute,
      updated_at: new Date().toISOString(),
    },)
    .onConflict((oc,) =>
      oc.columns(["origin", "workload_class",],).doUpdateSet({
        budget_mode: input.mode,
        max_concurrency: maxConcurrency,
        max_queue_depth: maxQueueDepth,
        requests_per_minute: requestsPerMinute,
        tokens_per_minute: tokensPerMinute,
        updated_at: new Date().toISOString(),
      },)
    )
    .execute();
}

/**
 * Drop a budget cell entirely, which restores the unlimited default.
 *
 * @param options
 * @param options.database
 * @param options.origin
 * @param options.workloadClass
 * @returns {Promise<boolean>} false when no such cell existed.
 */
export async function clearPerformanceBudget(
  options: { database: Kysely<DB>; origin: string; workloadClass: PeerWorkloadClass },
): Promise<boolean> {
  const result = await options.database
    .deleteFrom("federation_performance_budgets",)
    .where("origin", "=", options.origin,)
    .where("workload_class", "=", options.workloadClass,)
    .executeTakeFirst();

  return Number(result?.numDeletedRows ?? 0,) > 0;
}

/**
 * Project a write input onto the budget the read side returns, so a caller that
 * echoes the saved budget back to the panel does not re-derive the normalized
 * limits itself.
 *
 * @param input The submitted cell.
 * @returns {PerformanceBudget}
 * @throws {BudgetValidationError}
 */
export function toPerformanceBudget(input: BudgetWriteInput,): PerformanceBudget {
  return {
    origin: input.origin,
    workloadClass: input.workloadClass,
    mode: input.mode,
    maxConcurrency: normalizeLimit(input.maxConcurrency, "maxConcurrency",),
    maxQueueDepth: normalizeLimit(input.maxQueueDepth, "maxQueueDepth",),
    requestsPerMinute: normalizeLimit(input.requestsPerMinute, "requestsPerMinute",),
    tokensPerMinute: normalizeLimit(input.tokensPerMinute, "tokensPerMinute",),
  };
}
