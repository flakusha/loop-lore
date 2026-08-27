/**
 * Integration test: actor-key rotation preserves encrypted history
 *
 * Verifies the BUG-key-rotation-noop-orphans-history ticket claim is stale:
 *
 * - `rotateActorKeyAndReEncrypt` snapshots OLD chat keys BEFORE rotating,
 *   so re-encryption uses the OLD key to decrypt + NEW key to encrypt.
 * - All prior messages survive and decrypt with the post-rotation chat key.
 * - `key_id` on re-encrypted messages points to the NEW actor key.
 * - The OLD actor key has `status="expired"`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, resetTestDb, } from "../test-utils/create-test-db";
import { generateActorKey, loadActorKeys, } from "./actor-keys";
import { deriveChatKey, } from "./chat-keys";
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

function getSmkSafe(): CryptoKey {
  const smk = getSmk();
  if (!smk) { throw new Error("SMK not loaded — test setup failed",); }
  return smk;
}

async function insertUser(id: string,) {
  await db.insertInto("users",).values({ id, username: id, display_name: id, },).execute();
}

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

describe("rotateActorKeyAndReEncrypt — history preservation", () => {
  test("5 messages encrypted with OLD chat key survive actor-key rotation and decrypt with NEW chat key", async () => {
    const smk = getSmkSafe();

    // ── 1. Snapshot OLD chat key (HKDF from current participant keys) ──────
    const oldKeys = await db
      .selectFrom("actor_keys",)
      .select(["id",],)
      .where("actor_id", "in", [PARTICIPANT_1, PARTICIPANT_2,],)
      .where("status", "=", "active",)
      .execute();
    expect(oldKeys.length,).toBe(2,);
    const participantKeys = await loadActorKeys({ database: db, actorIds: [PARTICIPANT_1, PARTICIPANT_2,], smk, },);
    const oldChatKey = await deriveChatKey(participantKeys, CHAT_ID,);
    const oldKeyId = oldKeys[0]!.id;

    // ── 2. Encrypt 5 messages with the OLD chat key, store with key_id=OLD ─
    for (const [i, plaintext,] of PLAINTEXTS.entries()) {
      const content = await compressThenEncrypt({ plaintext, chatKey: oldChatKey.key, keyId: oldKeyId, },);
      await db.insertInto("messages",).values({
        id: `msg-${i + 1}`,
        chat_id: CHAT_ID,
        actor_id: PARTICIPANT_1,
        role: "user",
        content,
        key_id: oldKeyId,
        visibility: "visible",
        created_at: new Date(Date.now() - (PLAINTEXTS.length - i) * 1000,).toISOString(),
      },).execute();
    }

    // ── 3. Rotate PARTICIPANT_1's actor key ───────────────────────────────
    const result = await rotateActorKeyAndReEncrypt(db, PARTICIPANT_1, smk,);

    expect(result.actorId,).toBe(PARTICIPANT_1,);
    expect(result.oldKeyId,).toBe(oldKeyId,);
    expect(result.newKeyId,).not.toBe(oldKeyId,);
    expect(result.chatsAffected,).toBeGreaterThanOrEqual(1,);
    expect(result.messagesReEncrypted,).toBeGreaterThanOrEqual(5,);

    // ── 4. Derive NEW chat key (HKDF from post-rotation participant keys) ──
    const newParticipantKeys = await loadActorKeys({ database: db, actorIds: [PARTICIPANT_1, PARTICIPANT_2,], smk, },);
    const newChatKey = await deriveChatKey(newParticipantKeys, CHAT_ID,);
    expect(newChatKey.keyId,).not.toBe(oldKeyId,);
    expect(Array.from(newChatKey.rawKey,),).not.toEqual(Array.from(oldChatKey.rawKey,),);

    // ── 5. All 5 messages must decrypt with NEW chat key ─────────────────────
    const messages = await db
      .selectFrom("messages",)
      .select(["id", "content", "key_id",],)
      .where("chat_id", "=", CHAT_ID,)
      .orderBy("id", "asc",)
      .execute();
    expect(messages.length,).toBe(5,);

    for (const [i, row,] of messages.entries()) {
      expect(row.key_id,).toBe(result.newKeyId,);
      const plaintext = await decryptThenDecompress(row.content as string, newChatKey.key,);
      expect(plaintext,).toBe(PLAINTEXTS[i]!,);
    }

    // ── 6. Old actor key is expired ───────────────────────────────────────
    const oldKeyRow = await db
      .selectFrom("actor_keys",)
      .select(["status", "expires_at",],)
      .where("id", "=", oldKeyId,)
      .executeTakeFirst();
    expect(oldKeyRow?.status,).toBe("expired",);
    expect(oldKeyRow?.expires_at,).not.toBeNull();

    // ── 7. NEW actor key is active ─────────────────────────────────────────
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

  test("rotation preserves history across multiple rounds", async () => {
    const smk = getSmkSafe();
    // Initial HKDF chat key from current participant keys
    let participantKeys = await loadActorKeys({ database: db, actorIds: [PARTICIPANT_1, PARTICIPANT_2,], smk, },);
    let initialChatKey = await deriveChatKey(participantKeys, CHAT_ID,);
    const initialKeys = await db
      .selectFrom("actor_keys",)
      .select("id",)
      .where("actor_id", "=", PARTICIPANT_1,)
      .where("status", "=", "active",)
      .execute();
    const initialKeyId = initialKeys[0]!.id;

    // Encrypt 3 messages with initial chat key
    for (let i = 0; i < 3; i++) {
      const content = await compressThenEncrypt({
        plaintext: `round-1-msg-${i}`,
        chatKey: initialChatKey.key,
        keyId: initialKeyId,
      },);
      await db.insertInto("messages",).values({
        id: `r1-msg-${i}`,
        chat_id: CHAT_ID,
        actor_id: PARTICIPANT_1,
        role: "user",
        content,
        key_id: initialKeyId,
        visibility: "visible",
        created_at: new Date(Date.now() - (3 - i) * 1000,).toISOString(),
      },).execute();
    }

    // First rotation
    const r1 = await rotateActorKeyAndReEncrypt(db, PARTICIPANT_1, smk,);
    expect(r1.messagesReEncrypted,).toBeGreaterThanOrEqual(3,);
    participantKeys = await loadActorKeys({ database: db, actorIds: [PARTICIPANT_1, PARTICIPANT_2,], smk, },);
    const midChatKey = await deriveChatKey(participantKeys, CHAT_ID,);

    // Verify round-1 messages decrypt with the post-r1 chat key
    for (let i = 0; i < 3; i++) {
      const row = await db.selectFrom("messages",).select("content",).where("id", "=", `r1-msg-${i}`,)
        .executeTakeFirst();
      expect(row,).toBeDefined();
      const plaintext = await decryptThenDecompress(row!.content, midChatKey.key,);
      expect(plaintext,).toBe(`round-1-msg-${i}`,);
    }

    // Second rotation — add 2 more messages first
    for (let i = 0; i < 2; i++) {
      const content = await compressThenEncrypt({
        plaintext: `round-2-msg-${i}`,
        chatKey: midChatKey.key,
        keyId: r1.newKeyId,
      },);
      await db.insertInto("messages",).values({
        id: `r2-msg-${i}`,
        chat_id: CHAT_ID,
        actor_id: PARTICIPANT_1,
        role: "user",
        content,
        key_id: r1.newKeyId,
        visibility: "visible",
        created_at: new Date().toISOString(),
      },).execute();
    }

    const r2 = await rotateActorKeyAndReEncrypt(db, PARTICIPANT_1, smk,);
    expect(r2.messagesReEncrypted,).toBeGreaterThanOrEqual(5,);
    expect(r2.newKeyId,).not.toBe(r1.newKeyId,);

    // All 5 messages must decrypt with the post-r2 chat key
    participantKeys = await loadActorKeys({ database: db, actorIds: [PARTICIPANT_1, PARTICIPANT_2,], smk, },);
    const finalChatKey = await deriveChatKey(participantKeys, CHAT_ID,);
    for (let i = 0; i < 3; i++) {
      const row = await db.selectFrom("messages",).select("content",).where("id", "=", `r1-msg-${i}`,)
        .executeTakeFirst();
      const plaintext = await decryptThenDecompress(row!.content, finalChatKey.key,);
      expect(plaintext,).toBe(`round-1-msg-${i}`,);
    }
    for (let i = 0; i < 2; i++) {
      const row = await db.selectFrom("messages",).select("content",).where("id", "=", `r2-msg-${i}`,)
        .executeTakeFirst();
      const plaintext = await decryptThenDecompress(row!.content, finalChatKey.key,);
      expect(plaintext,).toBe(`round-2-msg-${i}`,);
    }
  });
});
