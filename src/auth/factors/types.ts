// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * MFA challenge types (epic-auth-channel-provisioning F1).
 *
 * A challenge binds (user, factor, purpose) to a single-use code. Only the
 * Argon2id hash of the code is persisted — the plaintext leaves the service
 * once, in the issue result, and is never logged.
 */
import type { Kysely, } from "kysely";
import type { ChallengePurpose, } from "../../db/enums";
import type { DB, } from "../../db/schema";

/** Error codes surfaced by the MFA challenge store. */
export type ChallengeErrorCode =
  | "not_found"
  | "purpose_mismatch"
  | "expired"
  | "consumed"
  | "invalid_code"
  | "too_many_attempts";

/** */
export interface ChallengeError {
  code: ChallengeErrorCode;
  message: string;
}

/** */
export type ChallengeResult<T,> = { ok: true; value: T } | { ok: false; error: ChallengeError };

/** A freshly issued challenge — `code` is plaintext and is never persisted. */
export interface IssuedChallenge {
  id: string;
  code: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

/** A challenge that passed code verification. */
export interface VerifiedChallenge {
  id: string;
  userId: string;
  factorId: string;
  purpose: ChallengePurpose;
}

/** */
export interface IssueChallengeParams {
  database: Kysely<DB>;
  userId: string;
  factorId: string;
  purpose: ChallengePurpose;
  /** Lifetime in ms; defaults to DEFAULT_CHALLENGE_TTL_MS. */
  ttlMs?: number;
  /** Clock in epoch ms; defaults to Date.now. */
  now?: () => number;
}

/** */
export interface VerifyChallengeParams {
  database: Kysely<DB>;
  challengeId: string;
  /** Owner of the challenge — a challenge of another user is not found. */
  userId: string;
  code: string;
  /** Purpose the caller expects; a challenge of another purpose is refused. */
  purpose: ChallengePurpose;
  /** Clock in epoch ms; defaults to Date.now. */
  now?: () => number;
}

/** */
export interface SweepExpiredParams {
  database: Kysely<DB>;
  /** Clock in epoch ms; defaults to Date.now. */
  now?: () => number;
}
