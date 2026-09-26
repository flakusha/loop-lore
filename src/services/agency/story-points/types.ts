// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Story points — public type surface (interfaces + error classes).
 * Pure types, no DB / no Kysely. Imports are stable across the package.
 *
 * @module services/agency/story-points/types
 */

/** Public balance snapshot. */
export interface StoryPointBalance {
  actor_id: string;
  world_id: string | null;
  balance: number;
  earned_total: number;
  spent_total: number;
  cap: number | null;
  updated_at: string;
}

/** Ledger row returned by earn/spend — includes the synthesized id. */
export interface StoryPointLedger extends StoryPointBalance {
  ledger_id: string;
  amount: number;
  reason: string | null;
  kind: "earn" | "spend";
}

/** Spend / earn parameter object. */
export interface StoryPointChange {
  actorId: string;
  worldId?: string | null;
  amount: number;
  reason?: string | null;
}

/** Thrown when a spend would push balance below zero. */
export class InsufficientStoryPointsError extends Error {
  override readonly name = "InsufficientStoryPointsError";
  constructor(public readonly actorId: string, public readonly requested: number, public readonly available: number,) {
    super(`Insufficient story points for actor ${actorId}: requested ${requested}, available ${available}`,);
  }
}

/** Thrown when an earn would push balance above the configured cap. */
export class CapExceededError extends Error {
  override readonly name = "CapExceededError";
  constructor(public readonly actorId: string, public readonly attempted: number, public readonly cap: number,) {
    super(`Story point cap ${cap} would be exceeded for actor ${actorId} (attempted +${attempted})`,);
  }
}

/** Thrown when amount is non-positive or non-integer. */
export class InvalidAmountError extends Error {
  override readonly name = "InvalidAmountError";
  constructor(public readonly amount: number,) {
    super(`Invalid story point amount: ${amount} (must be a positive integer)`,);
  }
}

export function assertValidAmount(amount: number,): void {
  if (!Number.isInteger(amount,) || amount <= 0) { throw new InvalidAmountError(amount,); }
}
