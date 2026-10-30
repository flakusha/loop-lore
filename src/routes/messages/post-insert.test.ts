// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * DOM-2 trigger tests: runPostInsertChatEffects replicates through fanOutContent.
 *
 * - Consented chat + trusted (unreachable) peer -> fan-out runs, reserve
 *   fails, a mesh_outbox row lands for the message (proves the trigger fired
 *   AND chatId was populated: without chatId the gate denies chat-missing
 *   and nothing is queued).
 * - Unconsented chat -> clearance denies, nothing queued, write still succeeds.
 * - Federation disabled -> silent no-op, nothing queued.
 * - Peer failure never rejects the write path.
 *
 * Timing note (ts-no-test-timers exception): the trigger is fire-and-forget
 * with no exposed signal, and the chain crosses real DNS + real SQLite, so
 * fake timers cannot drive it. waitFor polls the actual outbox condition
 * instead of guessing a duration; the negative cases bound the same poll.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { grantChatFederationConsent, } from "../../federation/clearance";
import { upsertPeer, } from "../../federation/coordinator";
import { createLogger, } from "../../logger";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { runPostInsertChatEffects, } from "./post-insert";

const PEER = "https://loop-lore-invalid-peer.invalid";

function testConfig(enabled: boolean,): Config {
  return {
    federation: {
      enabled,
      peers: [],
      meshPsk: "mesh-test-psk",
      duplication: { mode: "trusted", peers: [], },
    },
    server: { host: "localhost", port: 3000, },
    assistant: { enabled: false, },
    generation: { providers: { openaiCompatible: [], }, defaultProvider: null, },
  } as unknown as Config;
}

async function outboxRows(db: Kysely<DB>, contentId: string,) {
  return db
    .selectFrom("mesh_outbox",)
    .select(["target_origin", "content_id", "chat_id",],)
    .where("content_id", "=", contentId,)
    .execute();
}

/** Poll the real outbox condition; resolves true when it holds, false on timeout. */
async function waitFor(
  cond: () => Promise<boolean>,
  timeoutMs = 15000,
): Promise<boolean> {
  const start = Date.now();
  for (;;) {
    if (await cond()) { return true; }
    if (Date.now() - start > timeoutMs) { return false; }
    const { promise, resolve, } = Promise.withResolvers<void>();
    setTimeout(resolve, 50,);
    await promise;
  }
}

describe("post-insert fan-out trigger", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
  let userId: string;
  let actorId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, sqlite, } = await createTestDb());
    userId = await insertUsers(db, "fanout-user", "Fanout",);
    actorId = await insertActors(db, "Fanout Actor", {
      actor_type: "user",
      user_id: userId,
      owner_id: userId,
    },);

    await upsertPeer(db, { origin: PEER, state: "trusted", },);
  },);

  afterAll(async () => {
    await resetTestDb(sqlite,);
  },);

  test("consented chat: trigger fires, failed push queues a mesh_outbox row", async () => {
    const chatId = "chat-fanout-ok";
    const messageId = "msg-fanout-ok";
    await insertChats(db, "fanout ok", userId, { id: chatId, encryption_level: "standard", },);
    await grantChatFederationConsent(db, chatId,);

    await runPostInsertChatEffects(
      db,
      testConfig(true,),
      chatId,
      actorId,
      messageId,
      "hello hello",
      undefined,
    );

    const queued = await waitFor(async () => (await outboxRows(db, messageId,)).length > 0);
    expect(queued,).toBe(true,);
    const rows = await outboxRows(db, messageId,);
    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.target_origin,).toBe(PEER,);
    expect(rows[0]!.chat_id,).toBe(chatId,);
  });

  test("unconsented chat: nothing sent, write still succeeds", async () => {
    const chatId = "chat-fanout-noconsent";
    const messageId = "msg-fanout-noconsent";
    await insertChats(db, "fanout noconsent", userId, { id: chatId, encryption_level: "standard", },);

    await runPostInsertChatEffects(
      db,
      testConfig(true,),
      chatId,
      actorId,
      messageId,
      "hello hello",
      undefined,
    );

    // A row appearing would prove the trigger bypassed the gate: bound the
    // same poll and expect it to time out with nothing queued.
    const queued = await waitFor(async () => (await outboxRows(db, messageId,)).length > 0, 1500,);
    expect(queued,).toBe(false,);
  });

  test("federation disabled: silent no-op", async () => {
    const chatId = "chat-fanout-off";
    const messageId = "msg-fanout-off";
    await insertChats(db, "fanout off", userId, { id: chatId, encryption_level: "standard", },);
    await grantChatFederationConsent(db, chatId,);

    await runPostInsertChatEffects(
      db,
      testConfig(false,),
      chatId,
      actorId,
      messageId,
      "hello hello",
      undefined,
    );

    const queued = await waitFor(async () => (await outboxRows(db, messageId,)).length > 0, 1500,);
    expect(queued,).toBe(false,);
  });

  test("unreachable peer never rejects the write path", async () => {
    const chatId = "chat-fanout-fail";
    const messageId = "msg-fanout-fail";
    await insertChats(db, "fanout fail", userId, { id: chatId, encryption_level: "standard", },);
    await grantChatFederationConsent(db, chatId,);

    await expect(
      runPostInsertChatEffects(
        db,
        testConfig(true,),
        chatId,
        actorId,
        messageId,
        "hello hello",
        undefined,
      ),
    ).resolves.toBeUndefined();
  });
});
