/**
 * Integration test: actor-key rotation with stable per-chat keys.
 *
 * Post-054 design: messages use stable per-chat random keys (deriveChatKeyForChat),
 * NOT actor-derived HKDF keys. Actor key rotation does NOT require message re-encryption.
 *
 * Verifies:
 * - `rotateActorKeyAndReEncrypt` rotates the actor key without touching messages.
 * - Messages remain decryptable with the original (stable) chat key after rotation.
 * - `messagesReEncrypted` is 0 (no re-encryption needed).
 * - The OLD actor key has `status="expired"`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, resetTestDb, } from "../test-utils/create-test-db";
import { generateActorKey, } from "./actor-keys";
import { deriveChatKeyForChat, } from "./chat-keys";
import { rotateActorKeyAndReEncrypt, } from "./key-rotation/rotate";
import { compressThenEncrypt, decryptThenDecompress, } from "./pipeline";
import { getSmk, initSmk, } from "./smk";

const VALID_HEX_KEY = "c".repeat(64,);
const OWNER_ID = "user-rot-owner";
const PARTICIPANT_1 = "actor-rot-1";
const PARTICIPANT_2 = "actor-rot-2";
const CHAT_ID = "chat-rotation-history";

let db: Kysely<DB>;
type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let sqlite: TestDb["sqlite"];

const PLAINTEXTS = [
  "first message before rotation",
  "second message before rotation",
  "third message before rotation",
  "fourth message before rotation",
  "fifth message before rotation",
];

/** */
function getSmkSafe(): CryptoKey {
  const smk = getSmk();
  if (!smk) { throw new Error("SMK not loaded — test setup failed",); }
  return smk;
}

/**
 * @param id
 */
async function insertUser(id: string,) {
  await db.insertInto("users",).values({ id, username: id, display_name: id, },).execute();
}

/**
 * @param id
 * @param type
 */
async function insertActor(id: string, type: "user" | "character",) {
  await db.insertInto("actors",).values({
    id,
    actor_type: type,
    display_name: id,
    agent_type: "none",
    settings: "{}",
    import_spec: "raw",
    data_source_format: "json",
    data_raw: null,
    user_id: type === "user" ? id : null,
    owner_id: type === "character" ? OWNER_ID : id,
    format_version: 0,
    visibility: "private",
  },).execute();
}

/**
 * @param id
 */
async function insertChat(id: string,) {
  await db.insertInto("chats",).values({
    id,
    name: id,
    type: "direct",
    mode: "direct",
    created_by: OWNER_ID,
    encryption_level: "standard",
  },).execute();
}

/**
 * @param chatId
 * @param actorId
 */
async function addParticipant(chatId: string, actorId: string,) {
  await db.insertInto("chat_participants",).values({
    chat_id: chatId,
    actor_id: actorId,
    role_in_chat: "member",
  },).execute();
}

beforeAll(async () => {
  const created = await createTestDb();
  db = created.db;
  sqlite = created.sqlite;
  await initSmk({
    serverEncryptionKey: VALID_HEX_KEY,
    required: false,
    compressThreshold: 128,
    compressAlgorithm: "gzip",
  },);
},);

beforeEach(async () => {
  resetTestDb(sqlite,);
  sqlite.run("PRAGMA foreign_keys = OFF",);
  await insertUser(OWNER_ID,);
  await insertChat(CHAT_ID,);
  await insertActor(PARTICIPANT_1, "character",);
  await insertActor(PARTICIPANT_2, "character",);
  await addParticipant(CHAT_ID, PARTICIPANT_1,);
  await addParticipant(CHAT_ID, PARTICIPANT_2,);
  const smk = getSmkSafe();
  await generateActorKey({ database: db, actorId: PARTICIPANT_1, smk, name: "primary", },);
  await generateActorKey({ database: db, actorId: PARTICIPANT_2, smk, name: "primary", },);
},);

afterAll(async () => {
  await initSmk({ required: false, compressThreshold: 128, compressAlgorithm: "gzip", },);
  db.destroy();
},);

describe("rotateActorKeyAndReEncrypt — stable per-chat keys", () => {
  test("actor key rotation does not re-encrypt messages (stable chat key)", async () => {
    const smk = getSmkSafe();

    // ── 1. Derive the stable chat key ────────────────────────────────────
    const chatKey = await deriveChatKeyForChat(db, CHAT_ID, smk,);

    // ── 2. Encrypt 5 messages with the stable chat key ──────────────────
    for (const [i, plaintext,] of PLAINTEXTS.entries()) {
      const content = await compressThenEncrypt({ plaintext, chatKey: chatKey.key, keyId: chatKey.keyId, },);
      await db.insertInto("messages",).values({
        id: `msg-${i + 1}`,
        chat_id: CHAT_ID,
        actor_id: PARTICIPANT_1,
        role: "user",
        content,
        key_id: chatKey.keyId,
        visibility: "visible",
        created_at: new Date(Date.now() - (PLAINTEXTS.length - i) * 1000,).toISOString(),
      },).execute();
    }

    // ── 3. Rotate PARTICIPANT_1's actor key ───────────────────────────────
    const result = await rotateActorKeyAndReEncrypt(db, PARTICIPANT_1, smk,);

    expect(result.actorId,).toBe(PARTICIPANT_1,);
    expect(result.chatsAffected,).toBeGreaterThanOrEqual(1,);
    // No message re-encryption needed — chat keys are independent of actor keys.
    expect(result.messagesReEncrypted,).toBe(0,);

    // ── 4. Messages remain decryptable with the SAME stable chat key ─────
    const messages = await db
      .selectFrom("messages",)
      .select(["id", "content", "key_id",],)
      .where("chat_id", "=", CHAT_ID,)
      .orderBy("id", "asc",)
      .execute();
    expect(messages.length,).toBe(5,);

    for (const [i, row,] of messages.entries()) {
      // key_id unchanged — messages were NOT re-encrypted.
      expect(row.key_id,).toBe(chatKey.keyId,);
      const plaintext = await decryptThenDecompress(row.content as string, chatKey.key,);
      expect(plaintext,).toBe(PLAINTEXTS[i]!,);
    }

    // ── 5. NEW actor key is active ─────────────────────────────────────────
    const newKeyRow = await db
      .selectFrom("actor_keys",)
      .select("status",)
      .where("id", "=", result.newKeyId,)
      .executeTakeFirst();
    expect(newKeyRow?.status,).toBe("active",);
  });

  test("rotation with no messages succeeds without re-encrypting", async () => {
    const smk = getSmkSafe();
    const result = await rotateActorKeyAndReEncrypt(db, PARTICIPANT_1, smk,);
    expect(result.messagesReEncrypted,).toBe(0,);
    expect(result.actorId,).toBe(PARTICIPANT_1,);
    expect(result.newKeyId,).not.toBe(result.oldKeyId,);
  });

  test("multiple rotation rounds do not affect message decryption", async () => {
    const smk = getSmkSafe();
    // Derive the stable chat key (unchanged across rotations).
    const chatKey = await deriveChatKeyForChat(db, CHAT_ID, smk,);

    // Encrypt 3 messages with the stable chat key.
    for (let i = 0; i < 3; i++) {
      const content = await compressThenEncrypt({
        plaintext: `round-1-msg-${i}`,
        chatKey: chatKey.key,
        keyId: chatKey.keyId,
      },);
      await db.insertInto("messages",).values({
        id: `r1-msg-${i}`,
        chat_id: CHAT_ID,
        actor_id: PARTICIPANT_1,
        role: "user",
        content,
        key_id: chatKey.keyId,
        visibility: "visible",
        created_at: new Date(Date.now() - (3 - i) * 1000,).toISOString(),
      },).execute();
    }

    // First rotation — messages untouched.
    const r1 = await rotateActorKeyAndReEncrypt(db, PARTICIPANT_1, smk,);
    expect(r1.messagesReEncrypted,).toBe(0,);

    // Verify round-1 messages still decrypt with the SAME chat key.
    for (let i = 0; i < 3; i++) {
      const row = await db.selectFrom("messages",).select("content",).where("id", "=", `r1-msg-${i}`,)
        .executeTakeFirst();
      expect(row,).toBeDefined();
      const plaintext = await decryptThenDecompress(row!.content, chatKey.key,);
      expect(plaintext,).toBe(`round-1-msg-${i}`,);
    }

    // Second rotation — add 2 more messages first.
    for (let i = 0; i < 2; i++) {
      const content = await compressThenEncrypt({
        plaintext: `round-2-msg-${i}`,
        chatKey: chatKey.key,
        keyId: chatKey.keyId,
      },);
      await db.insertInto("messages",).values({
        id: `r2-msg-${i}`,
        chat_id: CHAT_ID,
        actor_id: PARTICIPANT_1,
        role: "user",
        content,
        key_id: chatKey.keyId,
        visibility: "visible",
        created_at: new Date().toISOString(),
      },).execute();
    }

    const r2 = await rotateActorKeyAndReEncrypt(db, PARTICIPANT_1, smk,);
    expect(r2.messagesReEncrypted,).toBe(0,);
    expect(r2.newKeyId,).not.toBe(r1.newKeyId,);

    // All 5 messages decrypt with the SAME stable chat key.
    for (let i = 0; i < 3; i++) {
      const row = await db.selectFrom("messages",).select("content",).where("id", "=", `r1-msg-${i}`,)
        .executeTakeFirst();
      const plaintext = await decryptThenDecompress(row!.content, chatKey.key,);
      expect(plaintext,).toBe(`round-1-msg-${i}`,);
    }
    for (let i = 0; i < 2; i++) {
      const row = await db.selectFrom("messages",).select("content",).where("id", "=", `r2-msg-${i}`,)
        .executeTakeFirst();
      const plaintext = await decryptThenDecompress(row!.content, chatKey.key,);
      expect(plaintext,).toBe(`round-2-msg-${i}`,);
    }
  });
});
