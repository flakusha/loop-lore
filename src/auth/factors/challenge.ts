// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * MFA challenge store (epic-auth-channel-provisioning F1, slice 1 of 3).
 *
 * A challenge binds (user, factor, purpose) to a single-use code: only the
 * Argon2id hash of the code is persisted, so the plaintext exists solely in
 * the issue response. Issuing a challenge supersedes any open challenge for
 * the same binding; verification consumes the row in a guarded update so two
 * concurrent verifications cannot both win.
 */
import { sql, } from "kysely";
import { generateInviteCode as generateChallengeCode, } from "../../chat/invites/code";
import { uid, } from "../../utils";
import { hashPassword, verifyPassword, } from "../password";
import type {
  ChallengeError,
  ChallengeResult,
  IssueChallengeParams,
  IssuedChallenge,
  SweepExpiredParams,
  VerifiedChallenge,
  VerifyChallengeParams,
} from "./types";

/** Default challenge lifetime in ms — 10 minutes. */
const DEFAULT_CHALLENGE_TTL_MS = 10 * 60 * 1000;

/** Failed code attempts allowed before a challenge is refused. */
export const MAX_CHALLENGE_ATTEMPTS = 5;

/** */
function fail(code: ChallengeError["code"], message: string,): { ok: false; error: ChallengeError } {
  return { ok: false, error: { code, message, }, };
}

/**
 * Issue a challenge bound to (user, factor, purpose) and return its plaintext
 * code once — the code itself is never stored.
 * @throws {Error} When the factor does not belong to the user, or the insert fails.
 * @returns {Promise<ChallengeResult<IssuedChallenge>>}
 */
export async function issueChallenge(params: IssueChallengeParams,): Promise<ChallengeResult<IssuedChallenge>> {
  const { database, userId, factorId, purpose, ttlMs = DEFAULT_CHALLENGE_TTL_MS, now = Date.now, } = params;

  const factor = await database
    .selectFrom("auth_factors",)
    .select("id",)
    .where("id", "=", factorId,)
    .where("user_id", "=", userId,)
    .executeTakeFirst();

  if (!factor) {
    return fail("not_found", "No such factor for this user",);
  }

  const code = generateChallengeCode();
  const id = uid();
  const createdAt = now();
  const expiresAt = createdAt + ttlMs;
  // Hashed BEFORE the transaction opens — Argon2id at the pinned params costs
  // ~100 ms and a 64 MiB allocation, and must not hold the SQLite write lock.
  const nonceHash = await hashPassword(code,);

  await database.transaction().execute(async (trx,) => {
    // A newer challenge supersedes the open one for the same binding.
    await trx
      .updateTable("auth_challenges",)
      .set({ consumed: 1, },)
      .where("user_id", "=", userId,)
      .where("factor_id", "=", factorId,)
      .where("purpose", "=", purpose,)
      .where("consumed", "=", 0,)
      .execute();

    await trx
      .insertInto("auth_challenges",)
      .values({
        id,
        user_id: userId,
        factor_id: factorId,
        purpose,
        nonce_hash: nonceHash,
        expires_at: expiresAt,
        created_at: createdAt,
      },)
      .execute();
  },);

  return { ok: true, value: { id, code, expiresAt, }, };
}

/**
 * Verify a challenge code and consume the challenge on success.
 * @throws {Error} When the code hash cannot be checked.
 * @returns {Promise<ChallengeResult<VerifiedChallenge>>}
 */
export async function verifyChallenge(params: VerifyChallengeParams,): Promise<ChallengeResult<VerifiedChallenge>> {
  const { database, challengeId, userId, code, purpose, now = Date.now, } = params;

  // The factor join re-checks factor ownership at verify time: nothing in SQL
  // ties auth_factors.user_id to auth_challenges.user_id, and the returned
  // factorId is what downstream authorization trusts.
  const row = await database
    .selectFrom("auth_challenges",)
    .innerJoin("auth_factors", "auth_factors.id", "auth_challenges.factor_id",)
    .selectAll("auth_challenges",)
    .where("auth_challenges.id", "=", challengeId,)
    .where("auth_challenges.user_id", "=", userId,)
    .where("auth_factors.user_id", "=", userId,)
    .executeTakeFirst();

  if (!row) {
    return fail("not_found", "No such challenge",);
  }

  if (row.purpose !== purpose) {
    return fail("purpose_mismatch", "Challenge was issued for another purpose",);
  }

  if (row.consumed) {
    return fail("consumed", "Challenge already used",);
  }

  if (row.expires_at <= now()) {
    return fail("expired", "Challenge expired",);
  }

  if (row.attempts >= MAX_CHALLENGE_ATTEMPTS) {
    return fail("too_many_attempts", "Too many failed attempts",);
  }

  if (!(await verifyPassword(code, row.nonce_hash,))) {
    await database
      .updateTable("auth_challenges",)
      .set({ attempts: sql`attempts + 1`, },)
      .where("id", "=", challengeId,)
      .where("consumed", "=", 0,)
      .execute();

    return fail("invalid_code", "Invalid code",);
  }

  // The guard IS the update: only one verification can flip the row.
  const consumed = await database
    .updateTable("auth_challenges",)
    .set({ consumed: 1, },)
    .where("id", "=", challengeId,)
    .where("consumed", "=", 0,)
    .executeTakeFirst();

  if (Number(consumed.numUpdatedRows ?? 0,) === 0) {
    return fail("consumed", "Challenge already used",);
  }

  return {
    ok: true,
    value: { id: row.id, userId: row.user_id, factorId: row.factor_id, purpose: row.purpose, },
  };
}

/**
 * Delete challenges whose TTL has elapsed.
 * @returns {Promise<number>} Number of deleted rows.
 */
export async function sweepExpired(params: SweepExpiredParams,): Promise<number> {
  const { database, now = Date.now, } = params;
  const deleted = await database
    .deleteFrom("auth_challenges",)
    .where("expires_at", "<=", now(),)
    .executeTakeFirst();

  return Number(deleted.numDeletedRows ?? 0,);
}
