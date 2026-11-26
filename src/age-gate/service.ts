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
import { AgeGateMode, } from "../db/enums";
import type { DB, } from "../db/schema";
import { calculateAge, parseExpiryMs, toDate, } from "../utils/date";

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

/** Base error for age-gate validation failures. */
export class AgeGateError extends Error {
  /**
   * @param message
   * @param options
   */
  constructor(message: string, options?: ErrorOptions,) {
    super(message, options,);
    this.name = "AgeGateError";
  }
}

/** Error raised when user is underage. */
export class UnderageError extends AgeGateError {
  /**
   * @param minimumAge
   * @param options
   */
  constructor(minimumAge: number, options?: ErrorOptions,) {
    const message = `You must be at least ${minimumAge} years old to use this service.`;
    super(message, options,);
    this.name = "UnderageError";
  }
}

// ── Options objects ──────────────────────────────────────────

/** Options for acceptAgeGate. */
export interface AcceptAgeGateOpts {
  database: Kysely<DB>;
  config: AgeGateConfig;
  userId: string;
  input: AgeGateAcceptInput;
}

// ── Service ──────────────────────────────────────────────────

/**
 * Modes with a real implementation. The config schema still lists
 * `verification`, but no distinct verification path exists — accepting it
 * would silently self-declare, so config boundaries reject it instead.
 */
export const SUPPORTED_AGE_GATE_MODES: readonly AgeGateConfig["mode"][] = [
  AgeGateMode.None,
  AgeGateMode.SelfDeclaration,
];

/** True when the mode has a real implementation. */
export function isSupportedAgeGateMode(mode: AgeGateConfig["mode"],): boolean {
  return SUPPORTED_AGE_GATE_MODES.includes(mode,);
}

/**
 * Check the age gate status for a given user.
 *
 * When age gate is disabled (`enabled=false` or `mode="none"`),
 * returns `{ isEnabled: false, hasPassed: true }` — no gating at all.
 *
 * Single source of truth for the age verdict: `checkAgeGate` in
 * `src/routes/chats/create.ts` and the NSFW base-eval
 * (`src/middleware/nsfw-gate/base-eval.ts`) both delegate here, so the two
 * gates cannot return contradictory verdicts for the same user.
 * @param config - Age-gate configuration.
 * @param user - User record with birth_date and age_gate_accepted_at.
 * @returns Current age-gate status.
 */
export function getStatus(
  config: AgeGateConfig,
  user: { birth_date: string | null; age_gate_accepted_at: string | null } | null,
): AgeGateStatus {
  const isEnabled = config.enabled && config.mode !== "none";

  if (!isEnabled) {
    return { isEnabled: false, hasPassed: true, minimumAge: config.minimumAge, mode: "none", };
  }

  // User must have a valid birth date, have accepted the gate, AND meet the
  // configured minimum age. Accept-time validation (validateAge) prevents
  // underage rows, but stored data can drift — re-check at decision time so
  // an accepted-but-underage user never passes.
  const hasPassed = user?.birth_date != null &&
    Boolean(user?.age_gate_accepted_at,) &&
    (() => {
      const age = calculateAge(user.birth_date,);
      return age !== null && age >= config.minimumAge;
    })();

  return { isEnabled: true, hasPassed, minimumAge: config.minimumAge, mode: config.mode, };
}

/**
 * Validate that a given birth date meets the minimum age requirement.
 * @param birthDate
 * @param minimumAge
 * @throws {UnderageError} if the user is below the minimum age
 * @throws {AgeGateError} if birthDate is not a valid ISO date
 * @returns {void}
 */
export function validateAge(birthDate: string, minimumAge: number,): void {
  if (parseExpiryMs(birthDate,) === null) {
    throw new AgeGateError("Invalid birth date. Expected YYYY-MM-DD format.",);
  }

  // One age verdict for accept and for every later check (RA-14).
  const age = calculateAge(birthDate,);
  if (age === null) {
    throw new AgeGateError("Invalid birth date. Expected YYYY-MM-DD format.",);
  }

  if (age < minimumAge) {
    throw new UnderageError(minimumAge,);
  }
}

/**
 * Accept the age gate: record the user's birth date and acceptance timestamp.
 * @param root0
 * @param root0.database
 * @param root0.config
 * @param root0.userId
 * @param root0.input
 * @throws {UnderageError} if the user is below the minimum age
 * @throws {AgeGateError} if birth date is invalid
 * @returns {Promise<void>}
 */
export async function acceptAgeGate({ database, config, userId, input, }: AcceptAgeGateOpts,): Promise<void> {
  if (!config.enabled || config.mode === "none") {
    // Gate is disabled — no-op but don't error
    return;
  }

  // Normalise once at the write: a client-supplied offset would otherwise be
  // re-parsed on every later check and could shift the calendar day (RA-14).
  const canonicalBirthDate = toDate(input.birthDate,).toISOString().slice(0, 10,);
  validateAge(canonicalBirthDate, config.minimumAge,);

  const now = new Date().toISOString();

  await database
    .updateTable("users",)
    .set({
      birth_date: canonicalBirthDate,
      age_gate_accepted_at: now,
    },)
    .where("id", "=", userId,)
    .execute();
}
