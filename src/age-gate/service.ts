// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Age Gate Service
 *
 * Handles age verification logic: checking whether gating is required,
 * validating user age, and recording acceptance.
 *
 * Age gate is fully opt-in via config. When disabled (default), all
 * checks pass without touching the database.
 */

import type { Kysely, } from "kysely";
import type { AgeGateConfig, } from "../config/schema";
import type { DB, } from "../db/schema";

/** Result of an age gate status check. */
export interface AgeGateStatus {
  /** Whether the age gate feature is enabled at all */
  isEnabled: boolean;
  /** Whether this specific user has passed the age gate */
  hasPassed: boolean;
  /** Minimum age requirement (only meaningful when enabled) */
  minimumAge: number;
  /** Gating mode */
  mode: AgeGateConfig["mode"];
}

/** Payload for accepting the age gate. */
export interface AgeGateAcceptInput {
  /** ISO date string (YYYY-MM-DD) — user's declared birth date */
  birthDate: string;
}

// ── Error types ──────────────────────────────────────────────

export class AgeGateError extends Error {
  constructor(message: string, options?: ErrorOptions,) {
    super(message, options,);
    this.name = "AgeGateError";
  }
}

export class UnderageError extends AgeGateError {
  constructor(minimumAge: number, options?: ErrorOptions,) {
    const message = `You must be at least ${minimumAge} years old to use this service.`;
    super(message, options,);
    this.name = "UnderageError";
  }
}

// ── Options objects ──────────────────────────────────────────

export interface AcceptAgeGateOpts {
  database: Kysely<DB>;
  config: AgeGateConfig;
  userId: string;
  input: AgeGateAcceptInput;
}

// ── Service ──────────────────────────────────────────────────

/**
 * Check the age gate status for a given user.
 *
 * When age gate is disabled (`enabled=false` or `mode="none"`),
 * returns `{ isEnabled: false, hasPassed: true }` — no gating at all.
 */
export function getStatus(
  config: AgeGateConfig,
  user: { birth_date: string | null; age_gate_accepted_at: string | null } | null,
): AgeGateStatus {
  const isEnabled = config.enabled && config.mode !== "none";

  if (!isEnabled) {
    return { isEnabled: false, hasPassed: true, minimumAge: config.minimumAge, mode: "none", };
  }

  // User must have a birth date AND have accepted the gate
  const hasPassed = user?.birth_date != null && Boolean(user?.age_gate_accepted_at,);

  return { isEnabled: true, hasPassed, minimumAge: config.minimumAge, mode: config.mode, };
}

/**
 * Validate that a given birth date meets the minimum age requirement.
 *
 * @throws {UnderageError} if the user is below the minimum age
 * @throws {AgeGateError} if birthDate is not a valid ISO date
 */
export function validateAge(birthDate: string, minimumAge: number,): void {
  const parsed = Date.parse(birthDate,);
  if (Number.isNaN(parsed,)) {
    throw new AgeGateError("Invalid birth date. Expected YYYY-MM-DD format.",);
  }

  const birth = new Date(parsed,);
  const today = new Date();

  // Calculate age in years relative to today
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  const dayDiff = today.getDate() - birth.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age--;
  }

  if (age < minimumAge) {
    throw new UnderageError(minimumAge,);
  }
}

/**
 * Accept the age gate: record the user's birth date and acceptance timestamp.
 *
 * @throws {UnderageError} if the user is below the minimum age
 * @throws {AgeGateError} if birth date is invalid
 */
export async function acceptAgeGate({ database, config, userId, input, }: AcceptAgeGateOpts,): Promise<void> {
  if (!config.enabled || config.mode === "none") {
    // Gate is disabled — no-op but don't error
    return;
  }

  validateAge(input.birthDate, config.minimumAge,);

  const now = new Date().toISOString();

  await database
    .updateTable("users",)
    .set({
      birth_date: input.birthDate,
      age_gate_accepted_at: now,
    },)
    .where("id", "=", userId,)
    .execute();
}
