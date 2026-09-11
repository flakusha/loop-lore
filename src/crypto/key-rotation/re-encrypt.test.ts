/**
 * Tests for crypto/key-rotation/re-encrypt.ts — re-encrypt after rotation
 *
 * Integration test with real in-memory DB + WebCrypto: derives a chat key
 * from actor keys, encrypts messages, and verifies re-encryption updates
 * key_id while keeping content decryptable with the current chat key.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { generateActorKey, } from "../actor-keys";
import { type ChatKey, deriveChatKeyForChat, } from "../chat-keys";
import { compressThenEncrypt, decryptThenDecompress, } from "../pipeline";
import { getSmk, initSmk, } from "../smk";
import { reEncryptChatMessages, reEncryptWithKeys, } from "./re-encrypt";

const VALID_HEX_KEY = "a".repeat(64,);
const CHAT_ID = "chat-reencrypt";
const OWNER_ID = "user-reenc-owner";
const ACTOR_A = "actor-reenc-a";
const ACTOR_B = "actor-reenc-b";

let db: Kysely<DB>;
type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let sqlite: TestDb["sqlite"];

interface InsertedMessage {
  id: string;
  createdAt: string;
}

/**
 * @param plaintext
 * @param chatKey
 * @param keyId
 * @param opts
 * @param opts.visibility
 * @param opts.createdAt
 * @param opts.id
 */
async function insertEncryptedMessage(
  plaintext: string,
  chatKey: CryptoKey,
  keyId: string,
  opts?: { visibility?: "visible" | "hidden_by_user"; createdAt?: string; id?: string },
): Promise<InsertedMessage> {
  const content = await compressThenEncrypt({ plaintext, chatKey, keyId, },);
  const id = opts?.id ?? `msg-${crypto.randomUUID()}`;
  await db.insertInto("messages",).values({
    id,
    chat_id: CHAT_ID,
    actor_id: ACTOR_A,
    role: "user",
    content,
    key_id: keyId,
    visibility: opts?.visibility ?? "visible",
    created_at: opts?.createdAt ?? new Date().toISOString(),
  },).execute();
  return { id, createdAt: opts?.createdAt ?? "", };
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

/** Fresh chat + actors + participant keys for each test. */
async function setupChat(): Promise<void> {
  await insertUsers(db, "owner", "Owner", { id: OWNER_ID, } as never,);
  await insertChats(db, "Re-encrypt Chat", OWNER_ID, { id: CHAT_ID, } as never,);
  await insertActors(db, "Actor A", { id: ACTOR_A, } as never,);
  await insertActors(db, "Actor B", { id: ACTOR_B, } as never,);
  await insertChatParticipants(db, CHAT_ID, ACTOR_A,);
  await insertChatParticipants(db, CHAT_ID, ACTOR_B,);

  const smk = getSmkSafe();
  await generateActorKey({ database: db, actorId: ACTOR_A, smk, name: "primary", },);
  await generateActorKey({ database: db, actorId: ACTOR_B, smk, name: "primary", },);
}

beforeEach(async () => {
  resetTestDb(sqlite,);
  await setupChat();
},);

/** */
function getSmkSafe(): CryptoKey {
  const smk = getSmk();
  if (!smk) { throw new Error("SMK not loaded — test setup failed",); }
  return smk;
}

/** */
async function currentChatKey(): Promise<ChatKey> {
  return deriveChatKeyForChat(db, CHAT_ID, getSmkSafe(),);
}

afterAll(async () => {
  await initSmk({ required: false, compressThreshold: 128, compressAlgorithm: "gzip", },);
  db.destroy();
},);

describe("reEncryptChatMessages", () => {
  test("re-encrypts visible encrypted messages with the current key", async () => {
    const { key, keyId, } = await currentChatKey();
    await insertEncryptedMessage("hello one", key, keyId,);
    await insertEncryptedMessage("hello two", key, keyId,);

    const count = await reEncryptChatMessages(db, CHAT_ID, getSmkSafe(), 50,);
    expect(count,).toBe(2,);

    const rows = await db.selectFrom("messages",).select(["id", "content", "key_id",],)
      .where("chat_id", "=", CHAT_ID,).execute();
    for (const row of rows) {
      expect(row.key_id,).toBe(keyId,);
      const plaintext = await decryptThenDecompress(row.content, key,);
      expect(plaintext,).toMatch(/^hello (one|two)$/,);
    }
  });

  test("skips messages without a key_id", async () => {
    const { key, keyId, } = await currentChatKey();
    await insertEncryptedMessage("encrypted", key, keyId,);
    await db.insertInto("messages",).values({
      id: "msg-plain",
      chat_id: CHAT_ID,
      actor_id: ACTOR_A,
      role: "user",
      content: "plaintext-visible",
      key_id: null,
      visibility: "visible",
      created_at: new Date().toISOString(),
    },).execute();

    const count = await reEncryptChatMessages(db, CHAT_ID, getSmkSafe(), 50,);
    expect(count,).toBe(1,);

    const plain = await db.selectFrom("messages",).select("content",).where("id", "=", "msg-plain",)
      .executeTakeFirst();
    expect(plain?.content,).toBe("plaintext-visible",);
  });

  test("skips non-visible (hidden) messages", async () => {
    const { key, keyId, } = await currentChatKey();
    await insertEncryptedMessage("visible", key, keyId,);
    await insertEncryptedMessage("hidden", key, keyId, { visibility: "hidden_by_user", },);

    const count = await reEncryptChatMessages(db, CHAT_ID, getSmkSafe(), 50,);
    expect(count,).toBe(1,);

    const hidden = await db.selectFrom("messages",).select(["key_id", "content",],)
      .where("visibility", "=", "hidden_by_user",).executeTakeFirst();
    // Hidden message untouched: still decrypts with the same chat key.
    expect(hidden?.key_id,).toBe(keyId,);
  });

  test("respects the limit, re-encrypting only the most recent messages", async () => {
    const { key, keyId, } = await currentChatKey();
    await insertEncryptedMessage("oldest", key, keyId, { createdAt: "2026-01-01T00:00:00.000Z", },);
    await insertEncryptedMessage("middle", key, keyId, { createdAt: "2026-01-02T00:00:00.000Z", },);
    await insertEncryptedMessage("newest", key, keyId, { createdAt: "2026-01-03T00:00:00.000Z", },);

    const count = await reEncryptChatMessages(db, CHAT_ID, getSmkSafe(), 2,);
    expect(count,).toBe(2,);
  });

  test("skips corrupt content without throwing", async () => {
    const { key, keyId, } = await currentChatKey();
    await insertEncryptedMessage("good", key, keyId,);
    await db.insertInto("messages",).values({
      id: "msg-corrupt",
      chat_id: CHAT_ID,
      actor_id: ACTOR_A,
      role: "user",
      content: "not-an-encrypted-payload",
      key_id: keyId,
      visibility: "visible",
      created_at: new Date().toISOString(),
    },).execute();

    const count = await reEncryptChatMessages(db, CHAT_ID, getSmkSafe(), 50,);
    expect(count,).toBe(1,);
  });

  test("returns 0 when there are no messages", async () => {
    const count = await reEncryptChatMessages(db, CHAT_ID, getSmkSafe(), 50,);
    expect(count,).toBe(0,);
  });
});
// AC9: re-encrypt full path with rollback semantics pin.
// Strategy: insert 3 messages where the middle row holds ciphertext that
// cannot be decrypted with the old key (simulates a row whose stored
// `content` was overwritten/corrupted independently of this re-encrypt).
// Call `reEncryptWithKeys` (the function used by `rotateKeyOnLeave`) directly
// with a fresh newKey, and observe both `reEncrypted` and `failures[]`.
//
// CURRENT rollback semantics (PIN): per-message try/catch — partial state.
// A failure on row N is caught, surfaced via `failures[]`, and the loop
// continues. Rows before and after N are still committed. There is NO
// transactional rollback inside `reEncryptWithKeys`; the caller
// (`rotateKeyOnLeave`) wraps the call in `database.transaction()` for
// atomicity at its layer. Future work may move the try/catch boundary up
// so a single failure aborts the whole batch — until then, callers MUST
// inspect `failures[]` and decide whether to retry / roll back.
test("reEncryptWithKeys: per-row failure pins partial-state rollback semantics (AC9)", async () => {
  const oldKey = await currentChatKey();
  // msg-1 + msg-3 are valid under oldKey; msg-2 has bogus ciphertext, so
  // `decryptThenDecompress` throws — caught inside the per-row try/catch.
  await insertEncryptedMessage("msg-one", oldKey.key, oldKey.keyId, {
    id: "ac9-msg-1",
    createdAt: "2026-01-01T00:00:00.000Z",
  },);
  await insertEncryptedMessage("msg-two", oldKey.key, oldKey.keyId, {
    id: "ac9-msg-2",
    createdAt: "2026-01-02T00:00:00.000Z",
  },);
  await insertEncryptedMessage("msg-three", oldKey.key, oldKey.keyId, {
    id: "ac9-msg-3",
    createdAt: "2026-01-03T00:00:00.000Z",
  },);
  // Corrupt the middle row in place — bypasses the encrypt helper so the
  // stored content cannot be decrypted with the old key, mimicking a row
  // whose underlying blob was independently tampered with or written by
  // a buggy client. The on-disk shape (string vs buffer) is what matters;
  // the decrypt pipeline will refuse it and throw into the catch.
  await db.updateTable("messages",)
    .set({ content: "not-an-encrypted-payload", },)
    .where("id", "=", "ac9-msg-2",)
    .execute();

  // A different newKey forces the re-encrypt to actually change ciphertext
  // + key_id on the rows that succeed. oldKey === newKey is the same-key
  // path used by `reEncryptChatMessages`.
  const newKeyId = crypto.randomUUID();
  const newRawKey = crypto.getRandomValues(new Uint8Array(32,),);
  const newCryptoKey = await crypto.subtle.importKey(
    "raw",
    newRawKey,
    { name: "AES-GCM", length: 256, },
    false,
    ["encrypt", "decrypt",],
  );
  const newKey = { key: newCryptoKey, keyId: newKeyId, rawKey: newRawKey, };

  // desc order: msg-3 first, msg-2 second (throws), msg-1 third.
  const result = await reEncryptWithKeys(db, CHAT_ID, oldKey, newKey, 50, { includeAll: true, },);
  expect(result.failures.length,).toBe(1,);
  expect(result.failures[0]?.id,).toBe("ac9-msg-2",);
  expect(result.reEncrypted,).toBe(2,);

  // Partial state in DB: msg-2 still carries oldKey.keyId; msg-1 + msg-3 use newKeyId.
  const rows = await db.selectFrom("messages",).select(["id", "key_id",],)
    .where("chat_id", "=", CHAT_ID,).execute();
  const byId = new Map(rows.map((r,) => [r.id, r.key_id,]),);
  expect(byId.get("ac9-msg-1",),).toBe(newKeyId,);
  expect(byId.get("ac9-msg-2",),).toBe(oldKey.keyId,);
  expect(byId.get("ac9-msg-3",),).toBe(newKeyId,);
});
