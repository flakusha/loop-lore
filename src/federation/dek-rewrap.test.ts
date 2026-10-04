// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the server-to-server DEK re-wrap protocol.
 *
 * Full A→B flow over two databases: A exports a chat DEK wrapped under B's
 * inbound content key, B opens with its inbound ciphers and materializes
 * the key in its own chat_keys. SMK suites run only under per-file
 * isolation (shared initSmk global), mirroring peer-keys.test.ts.
 */
import { beforeAll, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { encryptBytes, } from "../crypto/actor-key-bytes";
import { initSmk, } from "../crypto/smk";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertChatKeys, insertChats, insertUsers, } from "../test-utils/insert-helpers";
import { describeOrSkip, ISOLATED, } from "../test-utils/isolate-only";
import { pskCipher, } from "./cipher";
import {
  authorizeChatExport,
  type ChatClearance,
  grantChatFederationConsent,
} from "./clearance";
import {
  exportChatDekForPeer,
  importChatDek,
  openRewrappedDek,
  revokeDekExportsForPeer,
  type RewrappedDek,
} from "./dek-rewrap";
import {
  generateInboundKey,
  getOrCreateInboundKey,
  inboundCiphers,
  revokeInboundKey,
  rotateInboundKey,
} from "./peer-keys";

const SMK_HEX = "c".repeat(64,);
const A_ORIGIN = "https://a.example";
const B_ORIGIN = "https://b.example";

if (ISOLATED) {
  beforeAll(async () => {
    await initSmk({
      serverEncryptionKey: SMK_HEX,
      required: false,
      compressThreshold: 128,
      compressAlgorithm: "gzip",
    },);
  },);
}

async function smk(): Promise<CryptoKey> {
  const { getSmk, } = await import("../crypto/smk");
  const key = getSmk();
  if (key === null) { throw new Error("SMK not initialized",); }
  return key;
}

async function randomDek(): Promise<Uint8Array> {
  return crypto.getRandomValues(new Uint8Array(32,),);
}

/** Create the chat + its SMK-wrapped DEK + federation consent; returns [keyId, rawDek]. */
async function seedChat(database: Kysely<DB>, chatId: string,): Promise<[string, Uint8Array,]> {
  const user = await insertUsers(database, `u-${chatId}`, "U",);
  await insertChats(database, `chat ${chatId}`, user, { id: chatId, encryption_level: "standard", },);
  const raw = await randomDek();
  const keyId = await insertChatKeys(
    database,
    chatId,
    await encryptBytes(await smk(), raw,),
  );

  await grantChatFederationConsent(database, chatId,);

  return [keyId, raw,];
}

/** Run the clearance gate for one chat toward B (consent already granted by seedChat). */
async function clearFor(database: Kysely<DB>, chatId: string,): Promise<ChatClearance> {
  return authorizeChatExport(database, { chatId, peerOrigin: B_ORIGIN, },);
}

function toB64(bytes: Uint8Array,): string {
  return Buffer.from(bytes,).toString("base64",);
}

describeOrSkip("DEK re-wrap — sender export", () => {
  test("re-wraps under the peer key; never emits the SMK wrap verbatim", async () => {
    const { db, } = await createTestDb();
    const [keyId, raw,] = await seedChat(db, "chat-x",);
    const peerKey = generateInboundKey();

    const artifact = await exportChatDekForPeer(db, await smk(), {
      clearance: await clearFor(db, "chat-x",),
      senderOrigin: A_ORIGIN,
      peerContentKey: peerKey,
    },);

    expect(artifact.keyId,).toBe(keyId,);
    expect(artifact.senderOrigin,).toBe(A_ORIGIN,);
    expect(artifact.wrappedKey,).not.toBe(toB64(raw,),);
    const row = await db
      .selectFrom("chat_keys",)
      .select("encrypted_chat_key",)
      .where("chat_id", "=", "chat-x",)
      .executeTakeFirstOrThrow();

    expect(artifact.wrappedKey,).not.toBe(row.encrypted_chat_key,);

    const audits = await db
      .selectFrom("mesh_dek_exports",)
      .selectAll()
      .where("peer_origin", "=", B_ORIGIN,)
      .execute();

    expect(audits,).toHaveLength(1,);
    expect(audits[0]?.key_id,).toBe(keyId,);
    expect(audits[0]?.revoked_at,).toBeNull();
    // Audit rows carry no key material.
    expect(JSON.stringify(audits[0],),).not.toContain(artifact.wrappedKey,);
  });

  test("a non-recipient key cannot open the artifact", async () => {
    const { db, } = await createTestDb();
    await seedChat(db, "chat-bind",);
    const artifact = await exportChatDekForPeer(db, await smk(), {
      clearance: await clearFor(db, "chat-bind",),
      senderOrigin: A_ORIGIN,
      peerContentKey: generateInboundKey(),
    },);

    await expect(openRewrappedDek(artifact, [pskCipher(generateInboundKey(),),],),).rejects.toThrow(
      /no inbound cipher opened/,
    );
  });

  test("gate denials surface first; empty keys fail at export", async () => {
    const { db, } = await createTestDb();
    const key = await smk();

    // Unknown chat: the gate denies before export is ever reachable.
    await expect(clearFor(db, "chat-missing",),).rejects.toMatchObject({ reason: "chat-missing", },);

    // Consented but non-standard tiers are denied by the gate.
    const noneUser = await insertUsers(db, "u-none", "U",);
    await insertChats(db, "chat none", noneUser, { id: "chat-none-tier", encryption_level: "none", },);
    await grantChatFederationConsent(db, "chat-none-tier",);
    await expect(authorizeChatExport(db, { chatId: "chat-none-tier", peerOrigin: B_ORIGIN, },),)
      .rejects.toMatchObject({ reason: "tier-not-exportable", },);

    const restUser = await insertUsers(db, "u-rest", "U",);
    await insertChats(db, "chat rest", restUser, { id: "chat-rest-tier", encryption_level: "at-rest", },);
    await grantChatFederationConsent(db, "chat-rest-tier",);
    await expect(authorizeChatExport(db, { chatId: "chat-rest-tier", peerOrigin: B_ORIGIN, },),)
      .rejects.toMatchObject({ reason: "tier-not-exportable", },);

    // Standard + consented, but the chat_keys row is empty: the gate passes
    // (tier + consent are its mandate) and export fails on the missing DEK.
    const emptyUser = await insertUsers(db, "u-empty", "U",);
    await insertChats(db, "chat empty", emptyUser, { id: "chat-empty", encryption_level: "standard", },);
    await insertChatKeys(db, "chat-empty", "",);
    await grantChatFederationConsent(db, "chat-empty",);
    await expect(exportChatDekForPeer(db, key, {
      clearance: await clearFor(db, "chat-empty",),
      senderOrigin: A_ORIGIN,
      peerContentKey: generateInboundKey(),
    },),).rejects.toThrow("chat key not found",);

    // Invalid peer origin is caught by the gate.
    await seedChat(db, "chat-x",);
    await expect(authorizeChatExport(db, { chatId: "chat-x", peerOrigin: "not a url", },),)
      .rejects.toMatchObject({ reason: "invalid-peer-origin", },);

    // Invalid sender origin remains an export-level error.
    await expect(exportChatDekForPeer(db, key, {
      clearance: await clearFor(db, "chat-x",),
      senderOrigin: "ftp://bad",
      peerContentKey: generateInboundKey(),
    },),).rejects.toThrow("invalid sender origin",);
  });

  test("revoking a peer closes its audit rows once (idempotent)", async () => {
    const { db, } = await createTestDb();
    const key = await smk();
    await seedChat(db, "chat-r1",);
    await seedChat(db, "chat-r2",);
    for (const chatId of ["chat-r1", "chat-r2",]) {
      await exportChatDekForPeer(db, key, {
        clearance: await clearFor(db, chatId,),
        senderOrigin: A_ORIGIN,
        peerContentKey: generateInboundKey(),
      },);
    }

    await expect(revokeDekExportsForPeer(db, B_ORIGIN,),).resolves.toBe(2,);
    await expect(revokeDekExportsForPeer(db, B_ORIGIN,),).resolves.toBe(0,);
    const rows = await db
      .selectFrom("mesh_dek_exports",)
      .select("revoked_at",)
      .execute();

    expect(rows,).toHaveLength(2,);
    expect(rows[0]?.revoked_at,).not.toBeNull();
    await expect(revokeDekExportsForPeer(db, "https://ghost.example",),).resolves.toBe(0,);
    await expect(revokeDekExportsForPeer(db, "nope",),).rejects.toThrow("invalid peer origin",);
  });
},);

describeOrSkip("DEK re-wrap — receiver import", () => {
  test("round-trips: B opens A's artifact and materializes its chat_keys", async () => {
    const sender = await createTestDb();
    const [keyId, raw,] = await seedChat(sender.db, "chat-rt",);

    // B provisions its inbound key for A (the reserve-handshake artifact).
    const receiver = await createTestDb();
    const rKey = await smk();
    const receiverUser = await insertUsers(receiver.db, "u-rt", "U",);
    await insertChats(receiver.db, "chat rt", receiverUser, { id: "chat-rt", encryption_level: "standard", },);
    const peerContentKey = await getOrCreateInboundKey(receiver.db, rKey, A_ORIGIN,);

    const artifact = await exportChatDekForPeer(sender.db, await smk(), {
      clearance: await clearFor(sender.db, "chat-rt",),
      senderOrigin: A_ORIGIN,
      peerContentKey,
    },);

    const importedId = await importChatDek(
      receiver.db,
      rKey,
      artifact,
      await inboundCiphers(receiver.db, rKey, A_ORIGIN,),
    );

    expect(importedId,).toBe(keyId,);
    const row = await receiver.db
      .selectFrom("chat_keys",)
      .select("encrypted_chat_key",)
      .where("chat_id", "=", "chat-rt",)
      .executeTakeFirstOrThrow();

    const { decryptBytes, } = await import("../crypto/actor-key-bytes");
    expect(toB64((await decryptBytes(rKey, row.encrypted_chat_key,)) as Uint8Array,),).toBe(toB64(raw,),);
  });

  test("a foreign key cannot open the artifact", async () => {
    const sender = await createTestDb();
    await seedChat(sender.db, "chat-fk",);
    const artifact = await exportChatDekForPeer(sender.db, await smk(), {
      clearance: await clearFor(sender.db, "chat-fk",),
      senderOrigin: A_ORIGIN,
      peerContentKey: generateInboundKey(),
    },);

    await expect(openRewrappedDek(artifact, [pskCipher(generateInboundKey(),),],),).rejects.toThrow(
      /no inbound cipher opened/,
    );
  });

  test("rotation keeps a grace window; revocation kills access", async () => {
    const receiver = await createTestDb();
    const rKey = await smk();
    const receiverUser = await insertUsers(receiver.db, "u-rot", "U",);
    await insertChats(receiver.db, "chat rot", receiverUser, { id: "chat-rot", encryption_level: "standard", },);
    const oldPeerKey = await getOrCreateInboundKey(receiver.db, rKey, A_ORIGIN,);

    const sender = await createTestDb();
    await seedChat(sender.db, "chat-rot-src",);
    const artifact: RewrappedDek = await exportChatDekForPeer(sender.db, await smk(), {
      clearance: await clearFor(sender.db, "chat-rot-src",),
      senderOrigin: A_ORIGIN,
      peerContentKey: oldPeerKey,
    },);

    // Rotate: old key survives as grace, so the artifact still opens.
    await rotateInboundKey(receiver.db, rKey, A_ORIGIN,);
    const grace = await inboundCiphers(receiver.db, rKey, A_ORIGIN,);
    expect(grace,).toHaveLength(2,);
    const opened = await openRewrappedDek(artifact, grace,);
    expect(opened,).toHaveLength(32,);

    // Revoke: no inbound ciphers remain, the artifact is dead.
    await revokeInboundKey(receiver.db, A_ORIGIN,);
    await expect(openRewrappedDek(artifact, await inboundCiphers(receiver.db, rKey, A_ORIGIN,),),).rejects.toThrow();
  });

  test("an existing chat key wins over the artifact (first import authoritative)", async () => {
    const receiver = await createTestDb();
    const rKey = await smk();
    const receiverUser = await insertUsers(receiver.db, "u-win", "U",);
    await insertChats(receiver.db, "chat win", receiverUser, { id: "chat-win", encryption_level: "standard", },);
    const existingId = await insertChatKeys(receiver.db, "chat-win", await encryptBytes(rKey, await randomDek(),),);
    const peerContentKey = await getOrCreateInboundKey(receiver.db, rKey, A_ORIGIN,);

    const sender = await createTestDb();
    await seedChat(sender.db, "chat-win",);
    const artifact = await exportChatDekForPeer(sender.db, await smk(), {
      clearance: await clearFor(sender.db, "chat-win",),
      senderOrigin: A_ORIGIN,
      peerContentKey,
    },);

    const importedId = await importChatDek(
      receiver.db,
      rKey,
      artifact,
      await inboundCiphers(receiver.db, rKey, A_ORIGIN,),
    );

    expect(importedId,).toBe(existingId,);
    const rows = await receiver.db
      .selectFrom("chat_keys",)
      .select("id",)
      .where("chat_id", "=", "chat-win",)
      .execute();

    expect(rows,).toHaveLength(1,);
  });
},);
