// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * BE-1 regression — a client-supplied `key_id` must be validated against the
 * chat's live keys before it reaches `messages.key_id`.
 *
 * The envelope's `key_id` is client supplied. Persisted unvalidated, a forged
 * id produced a row nobody can decrypt, and that row made
 * `rotateKeyOnLeave` fail forever — the chat became permanently un-rotateable
 * and the removed member kept the live key.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import { rotateKeyOnLeave, } from "../../crypto/key-distribution";
import { initSmk, } from "../../crypto/smk";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { createRoutes, } from "./create";

const FORGED_KEY_ID = "attacker-controlled-key-id-0001";

let db: Kysely<DB>;
let sender: string;
let otherActor: string;
let chatId: string;
let testConfig: Config;

/** A client-pre-encrypted envelope naming `keyId`. */
function forgedEnvelope(keyId: string,): string {
  const nonce = new Uint8Array(12,).fill(7,);
  const enc = new Uint8Array(32,).fill(9,);
  return JSON.stringify({
    enc: Buffer.from(enc,).toString("base64",),
    nonce: Buffer.from(nonce,).toString("base64",),
    algo: "aes-256-gcm",
    key_id: keyId,
  },);
}

beforeAll(async () => {
  await initSmk({
    required: false,
    serverEncryptionKey: "c".repeat(64,),
    compressThreshold: 128,
    compressAlgorithm: "gzip",
  },);

  ({ db, } = await createTestDb());
  const defaults = structuredClone(createConfigSchema().defaults,) as Config;
  defaults.generation.defaultProvider = "";
  defaults.encryption.compressThreshold = 128;
  defaults.encryption.compressAlgorithm = "gzip";
  testConfig = defaults;

  sender = uid();
  await insertUsers(db, `u-${sender}`, "Sender", { id: sender as never, },);
  // The message route uses the USER id as `actor_id`, so the user needs the
  // companion actor row (registration creates one with id = userId).
  await insertActors(db, "Sender", { id: sender as never, user_id: sender, owner_id: sender, },);
  otherActor = uid();
  await insertActors(db, "Other Actor", { id: otherActor as never, },);
  chatId = uid();
  await insertChats(db, "Encrypted Chat", sender, {
    id: chatId as never,
    encryption_level: "standard",
  },);

  await insertChatParticipants(db, chatId, sender,);
  await insertChatParticipants(db, chatId, otherActor,);
},);

afterAll(async () => {
  await db.destroy();
},);

function makeApp(): Elysia {
  return new Elysia({ name: "be1-messages", },)
    .derive({ as: "scoped", }, () => ({ userId: sender, userRole: "user", }),)
    .use(createRoutes({ database: db, config: testConfig, },),) as unknown as Elysia;
}

async function postMessage(content: string,): Promise<Response> {
  return await makeApp().handle(
    new Request(`http://localhost/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({ content, },),
    },),
  );
}

describe("BE-1 — a client-supplied key_id must be validated", () => {
  test("a forged key_id is not persisted on the message row", async () => {
    const res = await postMessage(forgedEnvelope(FORGED_KEY_ID,),);

    // The write is rejected — the forged key id must never reach the DB.
    expect(res.status,).toBeGreaterThanOrEqual(400,);

    const rows = await db
      .selectFrom("messages",)
      .select(["id", "key_id",],)
      .where("chat_id", "=", chatId,)
      .execute();

    expect(rows.find((r,) => r.key_id === FORGED_KEY_ID),).toBeUndefined();
  });

  test("one forged message must not make the chat permanently un-rotateable", async () => {
    const failures: string[] = [];
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await rotateKeyOnLeave(db, chatId, sender,);
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error,),);
      }
    }

    // The chat must stay rotatable: at least one of the two attempts has to
    // succeed. With an undecryptable row in place both fail forever.
    expect(failures.length,).toBeLessThan(2,);
  });
});
