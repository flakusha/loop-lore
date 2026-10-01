// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Edge-case tests for crypto/e2e/latest-group-wrap.ts —
 * `latestGroupWrapForRecipient` (DB read path) plus a
 * `recordGroupWrap` → `latestGroupWrapForRecipient` round-trip.
 */

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { uid, } from "../../utils";
import { exportPublicJwk, generateKeyPair, } from "./key-pairs";
import { latestGroupWrapForRecipient, } from "./latest-group-wrap";
import { recordGroupWrap, } from "./wrap-sender-key";

const SESSION_A = "wrap-test-session-a";
const SESSION_B = "wrap-test-session-b";
const BOB = "wrap-test-bob";
const CAROL = "wrap-test-carol";

let db: Kysely<DB>;

/**
 * @param db
 * @param actorId
 */
async function seedActor(db: Kysely<DB>, actorId: string,): Promise<void> {
  const userId = `${actorId}-user`;
  await db.insertInto("users",).values({
    id: userId,
    username: userId,
    display_name: userId,
    password_hash: "dummy",
  },).execute();
  await db.insertInto("actors",).values({
    id: actorId,
    actor_type: "user",
    display_name: actorId,
    user_id: userId,
    owner_id: userId,
    agent_type: "none",
    settings: "{}",
    import_spec: "raw",
    data_source_format: "json",
    data_raw: null,
    format_version: 0,
    visibility: "private",
  },).execute();
}

/**
 * @param db
 * @param sessionId
 * @param senderActorId
 */
async function seedSession(
  db: Kysely<DB>,
  sessionId: string,
  senderActorId: string,
): Promise<void> {
  await db.insertInto("e2e_sessions",).values({
    id: sessionId,
    sender_actor_id: senderActorId,
  },).execute();
}

/**
 * @param db
 * @param groupSessionId
 * @param recipientActorId
 * @param wrappedKey
 * @param chainIndex
 */
async function insertWrap(
  db: Kysely<DB>,
  groupSessionId: string,
  recipientActorId: string,
  wrappedKey: string,
  chainIndex: number,
): Promise<void> {
  await db.insertInto("e2e_group_wraps",).values({
    id: uid(),
    group_session_id: groupSessionId,
    recipient_actor_id: recipientActorId,
    wrapped_key: wrappedKey,
    sender_eph_pub_jwk: "{}",
    chain_index: chainIndex,
  },).execute();
}

beforeEach(async () => {
  ({ db, } = await createTestDb());
  await seedActor(db, BOB,);
  await seedActor(db, CAROL,);
  await seedSession(db, SESSION_A, BOB,);
  await seedSession(db, SESSION_B, BOB,);
},);

afterEach(async () => {
  await db.destroy();
},);

describe("latestGroupWrapForRecipient", () => {
  test("returns null when the table has no rows at all", async () => {
    expect(
      await latestGroupWrapForRecipient(db, SESSION_A, BOB,),
    ).toBeNull();
  });

  test("returns null when only other (group, recipient) combos exist", async () => {
    await insertWrap(db, SESSION_A, CAROL, "wrap-carol-a", 0,);
    await insertWrap(db, SESSION_B, BOB, "wrap-bob-b", 0,);
    expect(
      await latestGroupWrapForRecipient(db, SESSION_A, BOB,),
    ).toBeNull();
  });

  test("returns the single matching row with all fields mapped", async () => {
    await insertWrap(db, SESSION_A, BOB, "wrap-bob-a", 4,);
    const row = await latestGroupWrapForRecipient(db, SESSION_A, BOB,);
    expect(row,).not.toBeNull();
    expect(row!.groupSessionId,).toBe(SESSION_A,);
    expect(row!.recipientActorId,).toBe(BOB,);
    expect(row!.wrappedKey,).toBe("wrap-bob-a",);
    expect(row!.senderEphPubJwk,).toBe("{}",);
    expect(row!.chainIndex,).toBe(4,);
    expect(typeof row!.id,).toBe("string",);
  });

  test("returns the highest chain_index regardless of insert order", async () => {
    await insertWrap(db, SESSION_A, BOB, "wrap-idx-3", 3,);
    await insertWrap(db, SESSION_A, BOB, "wrap-idx--1", -1,);
    await insertWrap(db, SESSION_A, BOB, "wrap-idx-0", 0,);
    await insertWrap(db, SESSION_A, BOB, "wrap-idx-5", 5,);
    const row = await latestGroupWrapForRecipient(db, SESSION_A, BOB,);
    expect(row,).not.toBeNull();
    expect(row!.chainIndex,).toBe(5,);
    expect(row!.wrappedKey,).toBe("wrap-idx-5",);
  });

  test("does not return another recipient's row in the same group", async () => {
    await insertWrap(db, SESSION_A, BOB, "wrap-bob-a", 9,);
    await insertWrap(db, SESSION_A, CAROL, "wrap-carol-a", 1,);
    const row = await latestGroupWrapForRecipient(db, SESSION_A, BOB,);
    expect(row,).not.toBeNull();
    expect(row!.recipientActorId,).toBe(BOB,);
    expect(row!.wrappedKey,).toBe("wrap-bob-a",);
    expect(row!.chainIndex,).toBe(9,);
  });

  test("does not return another group's row for the same recipient", async () => {
    await insertWrap(db, SESSION_A, BOB, "wrap-bob-a", 2,);
    await insertWrap(db, SESSION_B, BOB, "wrap-bob-b", 7,);
    const row = await latestGroupWrapForRecipient(db, SESSION_A, BOB,);
    expect(row,).not.toBeNull();
    expect(row!.groupSessionId,).toBe(SESSION_A,);
    expect(row!.wrappedKey,).toBe("wrap-bob-a",);
  });
});

describe("recordGroupWrap → latestGroupWrapForRecipient round-trip", () => {
  test("a recorded wrap is readable back with matching fields", async () => {
    const kp = await generateKeyPair({ extractable: true, },);
    const pubJwk = await exportPublicJwk(kp.publicKey,);
    const recorded = await recordGroupWrap({
      database: db,
      groupSessionId: SESSION_A,
      recipientActorId: BOB,
      wrappedKey: "nonce-b64.ct-b64",
      senderEphPubJwk: pubJwk,
      chainIndex: 11,
    },);
    expect(recorded.chainIndex,).toBe(11,);
    expect(recorded.wrappedKey,).toBe("nonce-b64.ct-b64",);

    const fetched = await latestGroupWrapForRecipient(db, SESSION_A, BOB,);
    expect(fetched,).not.toBeNull();
    expect(fetched!.id,).toBe(recorded.id,);
    expect(fetched!.groupSessionId,).toBe(SESSION_A,);
    expect(fetched!.recipientActorId,).toBe(BOB,);
    expect(fetched!.wrappedKey,).toBe("nonce-b64.ct-b64",);
    expect(fetched!.senderEphPubJwk,).toBe(JSON.stringify(pubJwk,),);
    expect(fetched!.chainIndex,).toBe(11,);
  });

  test("unserializable senderEphPubJwk falls back to empty string", async () => {
    const circular = { kty: "EC", } as unknown as JsonWebKey & { self?: unknown };
    circular.self = circular;
    const recorded = await recordGroupWrap({
      database: db,
      groupSessionId: SESSION_A,
      recipientActorId: BOB,
      wrappedKey: "w",
      senderEphPubJwk: circular as unknown as JsonWebKey,
      chainIndex: 0,
    },);
    expect(recorded.senderEphPubJwk,).toBe("",);
    const fetched = await latestGroupWrapForRecipient(db, SESSION_A, BOB,);
    expect(fetched,).not.toBeNull();
    expect(fetched!.senderEphPubJwk,).toBe("",);
  });
});
