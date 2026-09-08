// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Rotation acceptance proofs — executable evidence for the key-rotation
 * BUG batch (auto-rotation scheme, transactional leave, asset coverage).
 *
 * 1. runAutoRotation over a message-bearing standard chat: zero errors,
 *    actor key expires, history still decrypts (no legacy re-encrypt).
 * 2. Forced mid-rotation failure (corrupt message): rotation throws,
 *    chat_keys row keeps the OLD id, surviving history still decrypts.
 * 3. Encrypted asset linked to the chat: member leaves, blob decrypts
 *    under the NEW chat key.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Kysely, sql, } from "kysely";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import type { EncryptionLevel, MessageVisibility, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, resetTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertAssets, insertUsers, } from "../../test-utils/insert-helpers";
import { generateActorKey, } from "../actor-keys";
import { decryptAssetBlob, encryptAssetBlob, } from "../asset-encryption";
import { getChatKeyById, } from "../chat-keys";
import { getChatKey, rotateKeyOnLeave, } from "../key-distribution";
import { compressThenEncrypt, decryptThenDecompress, } from "../pipeline";
import { getSmk, initSmk, } from "../smk";
import { runAutoRotation, } from "./auto-run";

const VALID_HEX_KEY = "b".repeat(64,);
const LEAVER = "proof-leaver";
const STAYER = "proof-stayer";
const CHAT = "proof-chat-001";
const ASSET_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const ASSET_PATH = `raw/${ASSET_ID.slice(0, 2,)}/${ASSET_ID.slice(2, 4,)}/${ASSET_ID}.png`;
const ASSET_BYTES = "PROOF-ASSET-PLAINTEXT";

let harness: TestDb;
let db: Kysely<DB>;
let uploadDir: string;
const savedUploadDir = process.env["UPLOAD_DIR"];

beforeAll(async () => {
  createLogger();
  harness = await createTestDb();
  db = harness.db;
  await sql`PRAGMA foreign_keys = OFF`.execute(db,);
  await initSmk({
    serverEncryptionKey: VALID_HEX_KEY,
    required: false,
    compressThreshold: 128,
    compressAlgorithm: "gzip",
  },);
  uploadDir = mkdtempSync(join(tmpdir(), "ll-rotation-proof-",),);
  process.env["UPLOAD_DIR"] = uploadDir;
},);

beforeEach(async () => {
  resetTestDb(harness.sqlite,);
  await sql`PRAGMA foreign_keys = OFF`.execute(db,);
},);

afterAll(async () => {
  process.env["UPLOAD_DIR"] = savedUploadDir;
  rmSync(uploadDir, { recursive: true, force: true, },);
  await initSmk({ required: false, compressThreshold: 128, compressAlgorithm: "gzip", },);
  harness.sqlite.close();
},);

/** */
async function insertActor(id: string,) {
  await db.insertInto("actors",).values({
    id,
    actor_type: "user",
    display_name: id,
    agent_type: "none",
    settings: "{}",
    import_spec: "raw",
    data_source_format: "json",
    data_raw: null,
    user_id: id,
    owner_id: id,
    format_version: 0,
    visibility: "private",
  },).execute();
}

/** */
async function insertChat(id: string, encryptionLevel: EncryptionLevel = "standard",) {
  await db.insertInto("chats",).values({
    id,
    name: id,
    type: "direct",
    mode: "direct",
    created_by: LEAVER,
    encryption_level: encryptionLevel,
  },).execute();
}

/** */
async function addParticipant(chatId: string, actorId: string,) {
  await db.insertInto("chat_participants",).values({ chat_id: chatId, actor_id: actorId, role_in_chat: "member", },)
    .execute();
}

/** */
async function encryptMessage(
  chatId: string,
  plaintext: string,
  actorId: string,
  visibility: MessageVisibility = "visible",
) {
  const chatKey = await getChatKey(db, chatId,);
  const encrypted = await compressThenEncrypt({ plaintext, chatKey: chatKey.key, keyId: chatKey.keyId, },);
  const id = crypto.randomUUID();
  await db.insertInto("messages",).values({
    id,
    chat_id: chatId,
    actor_id: actorId,
    role: "user",
    content: encrypted,
    content_encoding: "identity",
    key_id: chatKey.keyId,
    status: "confirmed",
    visibility,
  },).execute();
  return id;
}

/** */
async function decryptByKeyId(content: string, keyId: string,): Promise<string> {
  const chatKey = await getChatKeyById(db, keyId, getSmk()!,);
  if (!chatKey) { throw new Error(`Chat key not found: ${keyId}`,); }
  return decryptThenDecompress(content, chatKey.key,);
}

/** */
async function seedChatWithHistory() {
  await insertActor(LEAVER,);
  await insertActor(STAYER,);
  await insertChat(CHAT, "standard",);
  await addParticipant(CHAT, LEAVER,);
  await addParticipant(CHAT, STAYER,);
  const smk = getSmk()!;
  await generateActorKey({ database: db, actorId: LEAVER, smk, name: "primary", },);
  await generateActorKey({ database: db, actorId: STAYER, smk, name: "primary", },);
  await encryptMessage(CHAT, "visible hello", LEAVER,);
  await encryptMessage(CHAT, "hidden hello", STAYER, "hidden_by_user",);
}

/** */
async function insertOwnerAndGetId(username: string,): Promise<string> {
  await insertUsers(db, username, username,);
  const row = await db.selectFrom("users",).select("id",).where("username", "=", username,).executeTakeFirstOrThrow();
  return row.id;
}

describe("rotation acceptance proofs", () => {
  test("auto-rotation: zero errors, key expires, history decrypts", async () => {
    await seedChatWithHistory();
    const keyIdBefore = (await getChatKey(db, CHAT,)).keyId;
    await db.updateTable("actor_keys",)
      .set({ created_at: new Date(Date.now() - 100 * 86_400_000,).toISOString(), },)
      .where("actor_id", "=", LEAVER,)
      .where("name", "=", "primary",)
      .execute();

    const summary = await runAutoRotation(db, 90,);
    expect(summary.errors,).toEqual([],);
    expect(summary.rotated,).toBe(1,);

    // Chat key untouched — actor rotation must not re-encrypt history.
    expect((await getChatKey(db, CHAT,)).keyId,).toBe(keyIdBefore,);
    const msgs = await db.selectFrom("messages",).select(["content", "key_id",],).where("chat_id", "=", CHAT,)
      .execute();
    expect(msgs.length,).toBe(2,);
    for (const msg of msgs) {
      expect(msg.key_id,).toBe(keyIdBefore,);
      await expect(decryptByKeyId(msg.content, msg.key_id ?? "",),).resolves.toMatch(/hello/,);
    }
  });

  test("mid-rotation failure: throws, old key row survives, history readable", async () => {
    await seedChatWithHistory();
    const oldKeyId = (await getChatKey(db, CHAT,)).keyId;
    const corruptId = await encryptMessage(CHAT, "doomed", LEAVER,);
    await db.updateTable("messages",).set({ content: "not-valid-ciphertext", },).where("id", "=", corruptId,).execute();

    await expect(rotateKeyOnLeave(db, CHAT, LEAVER,),).rejects.toThrow("failed to re-encrypt",);

    const row = await db.selectFrom("chat_keys",).select("id",).where("chat_id", "=", CHAT,).executeTakeFirstOrThrow();
    expect(row.id,).toBe(oldKeyId,);
    const survivors = await db.selectFrom("messages",).select(["content", "key_id",],)
      .where("chat_id", "=", CHAT,).where("id", "!=", corruptId,).execute();
    for (const msg of survivors) {
      expect(msg.key_id,).toBe(oldKeyId,);
      await expect(decryptByKeyId(msg.content, msg.key_id ?? "",),).resolves.toMatch(/hello/,);
    }
  });

  test("leave with encrypted asset: blob decrypts under the new key", async () => {
    await seedChatWithHistory();
    const ownerId = await insertOwnerAndGetId("proof-owner",);
    const oldKey = await getChatKey(db, CHAT,);
    const sealed = await encryptAssetBlob(Buffer.from(ASSET_BYTES,), oldKey, oldKey.keyId, ASSET_ID, {
      algorithm: "zstd",
      threshold: 1024,
    }, "at-rest",);
    expect(sealed.encrypted,).toBe(true,);
    mkdirSync(join(uploadDir, "raw", ASSET_ID.slice(0, 2,), ASSET_ID.slice(2, 4,),), { recursive: true, },);
    writeFileSync(join(uploadDir, ASSET_PATH,), sealed.data,);
    await insertAssets(db, ownerId, "secret.png", "image/png", "image" as never, sealed.data.length, ASSET_PATH, {
      id: ASSET_ID as never,
      encryption_tier: "at-rest",
      encrypted_key_id: oldKey.keyId,
    },);
    await db.insertInto("asset_links",).values({ asset_id: ASSET_ID, entity_type: "chat", entity_id: CHAT, },)
      .execute();

    await rotateKeyOnLeave(db, CHAT, LEAVER,);

    const newKey = await getChatKey(db, CHAT,);
    expect(newKey.keyId,).not.toBe(oldKey.keyId,);
    const onDisk = readFileSync(join(uploadDir, ASSET_PATH,),);
    const plain = await decryptAssetBlob(onDisk, newKey, ASSET_ID,);
    expect(plain.toString(),).toBe(ASSET_BYTES,);
  });
});
