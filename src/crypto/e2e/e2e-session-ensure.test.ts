// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for ensureActiveSession group + insert-race branches
 * (src/crypto/e2e/e2e-session.ts) with a stub database — no real DB.
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { ensureActiveSession, } from "./e2e-session";

const PAIR_ROW = {
  id: "sess-pair",
  sender_actor_id: "a",
  recipient_actor_id: "b",
  chat_id: "",
  kind: "pair",
  revoked_at: null,
  created_at: "2026-09-11T00:00:00.000Z",
  last_message_at: null,
};

const GROUP_ROW = {
  ...PAIR_ROW,
  id: "sess-group",
  recipient_actor_id: "",
  chat_id: "c1",
  kind: "group",
};

/**
 * @param takes Queued executeTakeFirst results, in call order.
 * @param runs Queued execute implementations, in call order.
 * @returns Stub Kysely database serving the queues.
 */
function dbStub(takes: unknown[], runs: Array<() => Promise<unknown>>,): Kysely<DB> {
  const takeQueue = [...takes,];
  const runQueue = [...runs,];
  const chain = {
    selectAll: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    values: () => chain,
    executeTakeFirst: () => takeQueue.shift(),
    execute: () => runQueue.shift()?.(),
  };
  return {
    selectFrom: () => chain,
    insertInto: () => chain,
  } as unknown as Kysely<DB>;
}

describe("ensureActiveSession", () => {
  test("returns the existing pair session without inserting", async () => {
    const database = dbStub([PAIR_ROW,], [() => {
      throw new Error("must not insert",);
    },],);
    const session = await ensureActiveSession({
      database,
      senderActorId: "a",
      recipientActorId: "b",
    },);
    expect(session?.id,).toBe("sess-pair",);
  });

  test("returns the existing group session", async () => {
    const database = dbStub([GROUP_ROW,], [],);
    const session = await ensureActiveSession({
      database,
      senderActorId: "a",
      recipientActorId: "",
      chatId: "c1",
      kind: "group",
    },);
    expect(session?.id,).toBe("sess-group",);
  });

  test("creates a group session when none exists", async () => {
    const database = dbStub([undefined, GROUP_ROW,], [async () => undefined,],);
    const session = await ensureActiveSession({
      database,
      senderActorId: "a",
      recipientActorId: "",
      chatId: "c1",
      kind: "group",
    },);
    expect(session?.id,).toBe("sess-group",);
  });

  test("re-reads after a lost insert race", async () => {
    const database = dbStub([undefined, PAIR_ROW,], [async () => {
      throw new Error("UNIQUE constraint failed",);
    },],);
    const session = await ensureActiveSession({
      database,
      senderActorId: "a",
      recipientActorId: "b",
    },);
    expect(session?.id,).toBe("sess-pair",);
  });

  test("rethrows when the race re-read also misses", async () => {
    const database = dbStub([undefined, undefined,], [async () => {
      throw new Error("UNIQUE constraint failed",);
    },],);
    await expect(ensureActiveSession({
      database,
      senderActorId: "a",
      recipientActorId: "b",
    },),).rejects.toThrow("UNIQUE constraint failed",);
  });

  test("throws when the created row vanishes", async () => {
    const database = dbStub([undefined, undefined,], [async () => undefined,],);
    await expect(ensureActiveSession({
      database,
      senderActorId: "a",
      recipientActorId: "b",
    },),).rejects.toThrow("not found",);
  });
});
