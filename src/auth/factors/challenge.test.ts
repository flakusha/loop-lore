// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * MFA challenge store unit tests (epic-auth-channel-provisioning F1, slice 1).
 *
 * Pure: the clock is injected, so TTL and expiry are deterministic and no
 * timers, delivery channel or network is involved.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, Selectable, } from "kysely";
import { ChallengePurpose, FactorKind, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertAuthFactors, insertUsers, } from "../../test-utils/insert-helpers";
import { verifyPassword, } from "../password";
import { issueChallenge, MAX_CHALLENGE_ATTEMPTS, sweepExpired, verifyChallenge, } from "./challenge";

/** Fixed epoch-ms start of the injected clock. */
const T0 = 1_700_000_000_000;

let db: Kysely<DB>;
let clock: number;

/** The injected clock every service call runs on. */
const now = (): number => clock;

beforeEach(async () => {
  ({ db, } = await createTestDb());
  clock = T0;
},);

afterEach(async () => {
  await db.destroy();
},);

/** A user owning one e-mail factor. */
async function seedFactor(): Promise<{ userId: string; factorId: string }> {
  const userId = await insertUsers(db, "mfa-user", "MFA User",);
  const factorId = await insertAuthFactors(db, userId, FactorKind.Email, clock,);

  return { userId, factorId, };
}

/** The persisted row of a challenge — the only place a code may live. */
async function storedChallenge(id: string,): Promise<Selectable<DB["auth_challenges"]>> {
  const row = await db.selectFrom("auth_challenges",).selectAll().where("id", "=", id,).executeTakeFirst();
  if (!row) { throw new Error(`challenge ${id} was not stored`,); }

  return row;
}

/** Issue a login challenge and fail loudly when the issue failed. */
async function issueLoginChallenge(userId: string, factorId: string, ttlMs?: number,) {
  const issued = await issueChallenge({
    database: db,
    userId,
    factorId,
    purpose: ChallengePurpose.Login,
    ...(ttlMs === undefined ? {} : { ttlMs, }),
    now,
  },);

  if (!issued.ok) { throw new Error(`issue failed: ${issued.error.code}`,); }

  return issued.value;
}

describe("the MFA challenge store", () => {
  test("stores only the hash of the issued code", async () => {
    const { userId, factorId, } = await seedFactor();
    const issued = await issueLoginChallenge(userId, factorId,);

    const row = await storedChallenge(issued.id,);

    expect(row.nonce_hash,).not.toBe(issued.code,);
    expect(row.nonce_hash,).not.toContain(issued.code,);
    // The hash still proves the code — only the hash is persisted.
    expect(await verifyPassword(issued.code, row.nonce_hash,),).toBe(true,);
  });

  test("a challenge is single-use", async () => {
    const { userId, factorId, } = await seedFactor();
    const issued = await issueLoginChallenge(userId, factorId,);

    const first = await verifyChallenge({
      database: db,
      challengeId: issued.id,
      userId,
      code: issued.code,
      purpose: ChallengePurpose.Login,
      now,
    },);

    const second = await verifyChallenge({
      database: db,
      challengeId: issued.id,
      userId,
      code: issued.code,
      purpose: ChallengePurpose.Login,
      now,
    },);

    expect(first.ok,).toBe(true,);
    expect(second.ok,).toBe(false,);
    if (!second.ok) { expect(second.error.code,).toBe("consumed",); }
  });

  test("a challenge expires with its TTL", async () => {
    const { userId, factorId, } = await seedFactor();
    const issued = await issueLoginChallenge(userId, factorId, 1_000,);

    clock = issued.expiresAt + 1;
    const result = await verifyChallenge({
      database: db,
      challengeId: issued.id,
      userId,
      code: issued.code,
      purpose: ChallengePurpose.Login,
      now,
    },);

    expect(result.ok,).toBe(false,);
    if (!result.ok) { expect(result.error.code,).toBe("expired",); }
  });

  test("refuses a challenge once the attempt cap is reached", async () => {
    const { userId, factorId, } = await seedFactor();
    const issued = await issueLoginChallenge(userId, factorId,);

    for (let attempt = 0; attempt < MAX_CHALLENGE_ATTEMPTS; attempt++) {
      const result = await verifyChallenge({
        database: db,
        challengeId: issued.id,
        userId,
        code: "not-the-code",
        purpose: ChallengePurpose.Login,
        now,
      },);

      expect(result.ok,).toBe(false,);
      if (!result.ok) { expect(result.error.code,).toBe("invalid_code",); }
    }

    expect((await storedChallenge(issued.id,)).attempts,).toBe(MAX_CHALLENGE_ATTEMPTS,);

    // The right code is refused too — the cap locks the challenge, not just the guesses.
    const locked = await verifyChallenge({
      database: db,
      challengeId: issued.id,
      userId,
      code: issued.code,
      purpose: ChallengePurpose.Login,
      now,
    },);

    expect(locked.ok,).toBe(false,);
    if (!locked.ok) { expect(locked.error.code,).toBe("too_many_attempts",); }
  });

  test("a challenge issued for another purpose is refused", async () => {
    const { userId, factorId, } = await seedFactor();
    const issued = await issueLoginChallenge(userId, factorId,);

    const result = await verifyChallenge({
      database: db,
      challengeId: issued.id,
      userId,
      code: issued.code,
      purpose: ChallengePurpose.StepUp,
      now,
    },);

    expect(result.ok,).toBe(false,);
    if (!result.ok) { expect(result.error.code,).toBe("purpose_mismatch",); }
  });

  test("a factor of another user cannot be challenged", async () => {
    const ownerId = await insertUsers(db, "owner", "Owner",);
    const factorId = await insertAuthFactors(db, ownerId, FactorKind.Email, clock,);
    const otherId = await insertUsers(db, "other", "Other",);

    const issued = await issueChallenge({
      database: db,
      userId: otherId,
      factorId,
      purpose: ChallengePurpose.Login,
      now,
    },);

    expect(issued.ok,).toBe(false,);
    if (!issued.ok) { expect(issued.error.code,).toBe("not_found",); }
  });

  test("a newer challenge supersedes the open one for the same binding", async () => {
    const { userId, factorId, } = await seedFactor();
    const first = await issueLoginChallenge(userId, factorId,);
    const second = await issueLoginChallenge(userId, factorId,);

    const stale = await verifyChallenge({
      database: db,
      challengeId: first.id,
      userId,
      code: first.code,
      purpose: ChallengePurpose.Login,
      now,
    },);

    expect(stale.ok,).toBe(false,);
    if (!stale.ok) { expect(stale.error.code,).toBe("consumed",); }
    expect((await storedChallenge(second.id,)).consumed,).toBe(0,);
  });

  test("sweepExpired deletes only the challenges whose TTL elapsed", async () => {
    const { userId, factorId, } = await seedFactor();
    const live = await issueLoginChallenge(userId, factorId, 60_000,);
    // A second purpose on the same factor is a separate binding, so this
    // issue is not superseded by the login challenge.
    const doomed = await issueChallenge({
      database: db,
      userId,
      factorId,
      purpose: ChallengePurpose.StepUp,
      ttlMs: 1_000,
      now,
    },);

    if (!doomed.ok) { throw new Error(`issue failed: ${doomed.error.code}`,); }

    clock = T0 + 2_000;
    const deleted = await sweepExpired({ database: db, now, },);

    expect(deleted,).toBe(1,);
    const rows = await db.selectFrom("auth_challenges",).select("id",).execute();
    expect(rows.map((row,) => row.id),).toEqual([live.id,],);
  });
});
