// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/chat/invites/redeem-concurrency.test.ts — a capped invite admits
 * exactly `max_uses` people, even when the redemptions overlap.
 *
 * BUG-invite-max-uses-double-spend (REPRODUCED): both portals inserted the
 * participant and THEN wrote `uses = invite.uses + 1`, an absolute value read
 * before the transaction opened. Two users redeeming a `max_uses = 1` invite
 * both passed the pre-flight cap check, both were admitted, and `uses` ended
 * at 1 with the invite still `active`. The consume update is now the guard:
 * relative increment, `.where("uses", "<", max_uses)`, and `numUpdatedRows ===
 * 0` rolls the membership insert back as `used_up`.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { redeemInvite, } from "./redeem";
import type { RedeemOutcome, } from "./types";
const CODE = "ONCEONLY";
const CHAT = "chat1";
const OWNER = "actor-owner";
const OWNER_USER = "user-owner";
const ACTORS = [OWNER, "actor-a", "actor-b", "actor-c",];

let db: Kysely<DB>;

/** An active invite for `chat1` with `max_uses` uses left. */
async function seedInvite(maxUses: number | null,): Promise<void> {
  await db
    .insertInto("chat_invites",)
    .values({
      id: `inv-${maxUses ?? "null"}`,
      code: CODE,
      chat_id: CHAT,
      created_by: OWNER_USER,
      expires_at: null,
      max_uses: maxUses,
      uses: 0,
      status: "active",
    } as never,)
    .execute();
}

/** Run both redemptions so their transactions overlap. */
async function redeemConcurrently(): Promise<RedeemOutcome[]> {
  const [a, b,] = await Promise.all([
    redeemInvite(db, { code: CODE, actorId: "actor-a", },),
    redeemInvite(db, { code: CODE, actorId: "actor-b", },),
  ],);

  return [a, b,];
}

/** Actors that actually landed in the chat. */
async function memberIds(): Promise<string[]> {
  const rows = await db
    .selectFrom("chat_participants",)
    .select("actor_id",)
    .where("chat_id", "=", CHAT,)
    .execute();

  return rows.map((r,) => r.actor_id).sort();
}

/** The invite's current uses count. */
async function uses(): Promise<number | null> {
  const row = await db.selectFrom("chat_invites",).select("uses",).executeTakeFirst();
  return row?.uses ?? null;
}

beforeEach(async () => {
  ({ db, } = await createTestDb());
  for (const id of ACTORS) { await insertActors(db, id, { id, },); }
  await insertUsers(db, "owner", "Owner", { id: OWNER_USER, },);
  await insertChats(db, "Race", OWNER_USER, { id: CHAT, },);
},);

afterEach(async () => {
  await db.destroy();
},);

describe("a capped invite under concurrent redemption", () => {
  test("admits exactly ONE of two racing redemptions of a max_uses = 1 invite", async () => {
    await seedInvite(1,);

    const outcomes = await redeemConcurrently();

    expect(outcomes.filter((o,) => o.ok).length,).toBe(1,);
    expect(outcomes.filter((o,) => !o.ok && o.error.code === "used_up").length,).toBe(1,);
    // The loser's participant insert rolled back with its transaction.
    expect(await memberIds(),).toHaveLength(1,);
    // And the counter reflects the single redemption, not the max_race.
    expect(await uses(),).toBe(1,);
  });

  test("admits exactly TWO of three racing redemptions of a max_uses = 2 invite", async () => {
    await seedInvite(2,);

    const outcomes = await Promise.all([
      redeemInvite(db, { code: CODE, actorId: "actor-a", },),
      redeemInvite(db, { code: CODE, actorId: "actor-b", },),
      redeemInvite(db, { code: CODE, actorId: "actor-c", },),
    ],);

    expect(outcomes.filter((o,) => o.ok).length,).toBe(2,);
    expect(await memberIds(),).toHaveLength(2,);
    expect(await uses(),).toBe(2,);
  });

  test("an UNCAPPED invite still admits every racing redemption", async () => {
    await seedInvite(null,);

    const outcomes = await redeemConcurrently();

    expect(outcomes.every((o,) => o.ok),).toBe(true,);
    expect(await memberIds(),).toEqual(["actor-a", "actor-b",],);
    expect(await uses(),).toBe(2,);
  });
});
