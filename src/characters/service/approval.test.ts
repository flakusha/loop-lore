// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character approval workflow service tests.
 *
 * Pins the review state machine (draft/pending_review → approved/rejected)
 * and the actor-type scoping that keeps the character queue free of
 * user/narrator/system actors (they share the `actors` table).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { approve, getPendingReviews, reject, submitForReview, } from "./approval";

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const OTHER = "00000000-0000-4000-8000-0000000000a2";
const CHAR = "00000000-0000-4000-8000-0000000000c1";
const USER_ACTOR = "00000000-0000-4000-8000-0000000000b1";

describe("character approval service", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    await db.insertInto("users",).values({
      id: OWNER,
      username: "owner",
      display_name: "Owner",
      role: "user",
      status: "active",
      settings: "{}",
    },).execute();

    await db.insertInto("users",).values({
      id: OTHER,
      username: "other",
      display_name: "Other",
      role: "user",
      status: "active",
      settings: "{}",
    },).execute();

    // A character and a plain user actor, both created the normal way
    // (no explicit review_state → column default 'pending_review').
    await db.insertInto("actors",).values({
      id: CHAR,
      actor_type: "character",
      display_name: "Frodo",
      owner_id: OWNER,
    },).execute();

    await db.insertInto("actors",).values({
      id: USER_ACTOR,
      actor_type: "user",
      display_name: "Owner",
      user_id: OWNER,
      owner_id: OWNER,
    },).execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("submitForReview is a successful no-op for an already-pending character", async () => {
    // New characters default to pending_review, so this must not error.
    const res = await submitForReview({ database: db, actorId: CHAR, userId: OWNER, },);
    expect(res,).toEqual({ ok: true, value: undefined, },);
  });

  test("submitForReview rejects a non-owner", async () => {
    const res = await submitForReview({ database: db, actorId: CHAR, userId: OTHER, },);
    expect(res.ok,).toBe(false,);
  });

  test("submitForReview rejects a non-character actor", async () => {
    const res = await submitForReview({ database: db, actorId: USER_ACTOR, userId: OWNER, },);
    expect(res.ok,).toBe(false,);
  });

  test("submitForReview rejects an unknown actor", async () => {
    const res = await submitForReview({
      database: db,
      actorId: "00000000-0000-4000-8000-0000000000ff",
      userId: OWNER,
    },);

    expect(res.ok,).toBe(false,);
  });

  test("getPendingReviews lists only character actors", async () => {
    const res = await getPendingReviews({ database: db, },);
    expect(res.ok,).toBe(true,);
    if (!res.ok) { return; }
    const ids = res.value.map((r,) => r.id);
    expect(ids,).toContain(CHAR,);
    expect(ids,).not.toContain(USER_ACTOR,);
  });

  test("approve transitions pending_review → approved", async () => {
    const res = await approve({ database: db, actorId: CHAR, adminId: OWNER, },);
    expect(res,).toEqual({ ok: true, value: undefined, },);

    const row = await db.selectFrom("actors",).select("review_state",).where("id", "=", CHAR,)
      .executeTakeFirstOrThrow();

    expect(row.review_state,).toBe("approved",);
  });

  test("approve rejects a character not in pending_review", async () => {
    const res = await approve({ database: db, actorId: CHAR, adminId: OWNER, },);
    expect(res.ok,).toBe(false,);
  });

  test("approve rejects a non-character actor", async () => {
    const res = await approve({ database: db, actorId: USER_ACTOR, adminId: OWNER, },);
    expect(res.ok,).toBe(false,);
  });

  test("reject transitions pending_review → rejected", async () => {
    // Return the character to the queue via a fresh draft→pending path.
    await db.updateTable("actors",).set({ review_state: "draft", },).where("id", "=", CHAR,).execute();
    await submitForReview({ database: db, actorId: CHAR, userId: OWNER, },);

    const res = await reject({ database: db, actorId: CHAR, adminId: OWNER, reason: "nope", },);
    expect(res,).toEqual({ ok: true, value: undefined, },);

    const row = await db.selectFrom("actors",).select("review_state",).where("id", "=", CHAR,)
      .executeTakeFirstOrThrow();

    expect(row.review_state,).toBe("rejected",);
  });

  test("reject rejects a non-character actor", async () => {
    const res = await reject({ database: db, actorId: USER_ACTOR, adminId: OWNER, },);
    expect(res.ok,).toBe(false,);
  });

  test("submitForReview allows re-submission from rejected", async () => {
    const res = await submitForReview({ database: db, actorId: CHAR, userId: OWNER, },);
    expect(res,).toEqual({ ok: true, value: undefined, },);
    const row = await db.selectFrom("actors",).select("review_state",).where("id", "=", CHAR,)
      .executeTakeFirstOrThrow();

    expect(row.review_state,).toBe("pending_review",);
  });
});
