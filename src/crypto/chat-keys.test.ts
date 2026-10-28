/**
 * Tests for crypto/chat-keys.ts — Chat key derivation via HKDF
 */
import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Kysely, sql, } from "kysely";
import type { Migration, } from "kysely/migration";
import { Migrator, } from "kysely/migration";
import { readdirSync, } from "node:fs";
import path from "node:path";
import { createSqliteDialect, } from "../db/index";
import type { DB, } from "../db/schema";
import { insertChats, } from "../test-utils/insert-helpers";
import { generateActorKey, loadActorKeys, } from "./actor-keys";
import {
  deriveChatKey,
  deriveChatKeyForChat,
  getChatParticipantActorIds,
  isLiveChatKeyId,
  validateClientEncryptedPayload,
} from "./chat-keys";
import { compressThenEncrypt, } from "./pipeline";
import { getSmk, initSmk, } from "./smk";

const VALID_HEX_KEY = "a".repeat(64,);
const CHAT_ID = "chat-test-001";
const ACTOR_A = "actor-chat-a";
const ACTOR_B = "actor-chat-b";

let db: Kysely<DB>;

/** */
function getSmkKeySafe(): CryptoKey {
  const key = getSmk();
  if (!key) { throw new Error("SMK not loaded — test setup failed",); }
  return key;
}

beforeAll(async () => {
  const sqlite = new Database(":memory:",);
  sqlite.run("PRAGMA foreign_keys = OFF",);
  db = new Kysely<DB>({ dialect: createSqliteDialect(sqlite,), },);
  const migrator = new Migrator({
    db,
    provider: {
      async getMigrations(): Promise<Record<string, Migration>> {
        const dir = path.join(__dirname, "..", "db", "migrations",);
        const fileNames = readdirSync(dir,).filter((f,) => f.endsWith(".ts",)).sort();
        const migrations: Record<string, Migration> = {};
        for (const fileName of fileNames) {
          const mod = await import(path.join(dir, fileName,));
          migrations[fileName.replace(/\.ts$/, "",)] = mod.default ?? mod;
        }

        return migrations;
      },
    },
  },);

  const { error, } = await migrator.migrateToLatest();
  if (error) { throw new Error("Migration failed: " + JSON.stringify(error,),); }
  await sql`PRAGMA foreign_keys = OFF`.execute(db,);
  await initSmk({
    serverEncryptionKey: VALID_HEX_KEY,
    required: false,
    compressThreshold: 128,
    compressAlgorithm: "gzip",
  },);

  // Create two actors with encryption keys
  const smk = getSmkKeySafe();
  await generateActorKey({ database: db, actorId: ACTOR_A, smk, name: "primary", },);
  await generateActorKey({ database: db, actorId: ACTOR_B, smk, name: "primary", },);

  // Add participants
  await db
    .insertInto("chat_participants",)
    .values([
      { chat_id: CHAT_ID, actor_id: ACTOR_A, role_in_chat: "member", },
      { chat_id: CHAT_ID, actor_id: ACTOR_B, role_in_chat: "member", },
    ],)
    .execute();
},);

afterAll(async () => {
  // Reset SMK to prevent pollution of other test suites
  await initSmk({ required: false, compressThreshold: 128, compressAlgorithm: "gzip", },);
  db.destroy();
},);

// ── getChatParticipantActorIds ──────────────────────────────

describe("getChatParticipantActorIds", () => {
  test("returns all participant actor IDs for a chat", async () => {
    const ids = await getChatParticipantActorIds(db, CHAT_ID,);
    expect(ids,).toHaveLength(2,);
    expect(ids,).toContain(ACTOR_A,);
    expect(ids,).toContain(ACTOR_B,);
    // Should be sorted by actor_id ascending
    expect(ids[0],).toBe(ACTOR_A,); // "actor-chat-a" < "actor-chat-b"
    expect(ids[1],).toBe(ACTOR_B,);
  });

  test("returns empty array for unknown chat", async () => {
    const ids = await getChatParticipantActorIds(db, "nonexistent-chat",);
    expect(ids,).toEqual([],);
  });
});

// ── deriveChatKey ───────────────────────────────────────────

describe("deriveChatKey", () => {
  test("derives a valid AES-256-GCM key from participant keys", async () => {
    const smk = getSmkKeySafe();
    const keys = await loadActorKeys({ database: db, actorIds: [ACTOR_A, ACTOR_B,], smk, },);
    expect(keys,).toHaveLength(2,);

    const chatKey = await deriveChatKey(keys, CHAT_ID,);
    expect(chatKey.key,).not.toBeNull();
    expect(chatKey.key.algorithm.name,).toBe("AES-GCM",);
    expect(chatKey.key.type,).toBe("secret",);
    expect(chatKey.keyId,).toBe(keys[0]!.keyId,); // First participant's key
    expect(chatKey.rawKey,).toBeInstanceOf(Uint8Array,);
    expect(chatKey.rawKey.length,).toBe(32,); // 256-bit
  });

  test("deterministic: same inputs produce same key", async () => {
    const smk = getSmkKeySafe();
    const keys1 = await loadActorKeys({ database: db, actorIds: [ACTOR_A, ACTOR_B,], smk, },);
    const keys2 = await loadActorKeys({ database: db, actorIds: [ACTOR_A, ACTOR_B,], smk, },);

    const chatKey1 = await deriveChatKey(keys1, CHAT_ID,);
    const chatKey2 = await deriveChatKey(keys2, CHAT_ID,);

    // rawKey should be identical — HKDF is deterministic
    expect(Buffer.from(chatKey1.rawKey,).toString("hex",),).toBe(Buffer.from(chatKey2.rawKey,).toString("hex",),);
  });

  test("different chat IDs produce different keys", async () => {
    const smk = getSmkKeySafe();
    const keys = await loadActorKeys({ database: db, actorIds: [ACTOR_A, ACTOR_B,], smk, },);

    const chatKey1 = await deriveChatKey(keys, "chat-alpha",);
    const chatKey2 = await deriveChatKey(keys, "chat-beta",);

    expect(Buffer.from(chatKey1.rawKey,).toString("hex",),).not.toBe(
      Buffer.from(chatKey2.rawKey,).toString("hex",),
    );
  });

  test("participant order does not matter (keys sorted by actor_id)", async () => {
    const smk = getSmkKeySafe();
    // loadActorKeys always returns sorted by actor_id, so order is fixed
    const keysAsc = await loadActorKeys({ database: db, actorIds: [ACTOR_A, ACTOR_B,], smk, },);
    const keysDesc = await loadActorKeys({ database: db, actorIds: [ACTOR_B, ACTOR_A,], smk, },);

    const chatKey1 = await deriveChatKey(keysAsc, CHAT_ID,);
    const chatKey2 = await deriveChatKey(keysDesc, CHAT_ID,);

    expect(Buffer.from(chatKey1.rawKey,).toString("hex",),).toBe(Buffer.from(chatKey2.rawKey,).toString("hex",),);
  });

  test("throws on empty participant list", async () => {
    await expect(deriveChatKey([], CHAT_ID,),).rejects.toThrow("no participant keys",);
  });
});

// ── deriveChatKeyForChat (one-shot) ─────────────────────────

describe("deriveChatKeyForChat", () => {
  test("one-shot: loads participants and derives key", async () => {
    const smk = getSmkKeySafe();
    const chatKey = await deriveChatKeyForChat(db, CHAT_ID, smk,);
    expect(chatKey.key,).not.toBeNull();
    expect(chatKey.keyId,).toBeTruthy();
    expect(chatKey.rawKey.length,).toBe(32,);
  });

  test("same chat always produces same key via one-shot", async () => {
    const smk = getSmkKeySafe();
    const chatKey1 = await deriveChatKeyForChat(db, CHAT_ID, smk,);
    const chatKey2 = await deriveChatKeyForChat(db, CHAT_ID, smk,);

    expect(Buffer.from(chatKey1.rawKey,).toString("hex",),).toBe(Buffer.from(chatKey2.rawKey,).toString("hex",),);
  });

  test("different chat produces different key", async () => {
    const smk = getSmkKeySafe();
    // Add participants for another chat
    await db
      .insertInto("chat_participants",)
      .values([
        { chat_id: "chat-other", actor_id: ACTOR_A, role_in_chat: "member", },
        { chat_id: "chat-other", actor_id: ACTOR_B, role_in_chat: "member", },
      ],)
      .execute();

    const chatKey1 = await deriveChatKeyForChat(db, CHAT_ID, smk,);
    const chatKey2 = await deriveChatKeyForChat(db, "chat-other", smk,);

    expect(Buffer.from(chatKey1.rawKey,).toString("hex",),).not.toBe(
      Buffer.from(chatKey2.rawKey,).toString("hex",),
    );
  });

  test("concurrent lazy-create calls agree on a single chat_key row", async () => {
    const smk = getSmkKeySafe();
    const chatId = "chat-race-" + Math.random().toString(36,).slice(2, 8,);
    await db
      .insertInto("chat_participants",)
      .values([
        { chat_id: chatId, actor_id: ACTOR_A, role_in_chat: "member", },
        { chat_id: chatId, actor_id: ACTOR_B, role_in_chat: "member", },
      ],)
      .execute();

    // Fire 8 concurrent derives on a chat with no existing chat_key row.
    const results = await Promise.all(
      Array.from({ length: 8, }, () => deriveChatKeyForChat(db, chatId, smk,),),
    );

    // All callers succeed with the same keyId.
    const keyIds = new Set(results.map((r,) => r.keyId),);
    expect(keyIds.size,).toBe(1,);

    // Exactly one chat_keys row exists for the chat (unique index enforced).
    const rows = await db
      .selectFrom("chat_keys",)
      .select("id",)
      .where("chat_id", "=", chatId,)
      .execute();

    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.id,).toBe(results[0]!.keyId,);
  });

  /**
   * `isLiveChatKeyId` decides whether a client-named `key_id` may be stored
   * (BE-1). A forged id must never reach `messages.key_id`: a row nobody can
   * decrypt wedges the chat rotation for good.
   */
  describe("isLiveChatKeyId", () => {
    test("a null key id is never live", async () => {
      expect(await isLiveChatKeyId(db, "chat-missing", null,),).toBe(false,);
    });

    test("a chat with no row accepts the id — there is nothing to validate against", async () => {
      expect(await isLiveChatKeyId(db, "chat-missing", "key-forged",),).toBe(true,);
    });

    test("a non-standard chat accepts the id — only standard chats hold chat keys", async () => {
      const chatId = "chat-none-tier";
      await insertChats(db, "Chat", "user-1", { id: chatId, encryption_level: "none", } as never,);
      expect(await isLiveChatKeyId(db, chatId, "key-forged",),).toBe(true,);
    });

    test("a standard chat rejects a key id that is not one of its live keys", async () => {
      const chatId = "chat-standard-tier";
      await insertChats(db, "Chat", "user-1", { id: chatId, encryption_level: "standard", } as never,);
      expect(await isLiveChatKeyId(db, chatId, "key-forged",),).toBe(false,);
    });
  });

  /**
   * `validateClientEncryptedPayload` is the store boundary for a client-named
   * `key_id` (BE-1). A forged id — or the LIVE key id paired with ciphertext
   * nobody can read — reaches `messages.key_id` as a row that can never be
   * re-encrypted, and that wedges `rotateKeyOnLeave` for good.
   */
  describe("validateClientEncryptedPayload", () => {
    /**
     * A well-shaped encrypted envelope whose ciphertext is NOT encrypted
     * under the chat key — the shape a forged client payload has.
     * @param keyId
     * @returns {string}
     */
    function forgedPayload(keyId: string,): string {
      return JSON.stringify({
        enc: Buffer.from("not-a-real-ciphertext",).toString("base64",),
        nonce: Buffer.alloc(12,).toString("base64",),
        algo: "aes-256-gcm",
        key_id: keyId,
      },);
    }

    test("a standard chat rejects a key id that is not one of its live keys — stale, so the client can retry", async () => {
      const chatId = "chat-validate-stale";
      await insertChats(db, "Chat", "user-1", { id: chatId, encryption_level: "standard", } as never,);

      const result = await validateClientEncryptedPayload(db, chatId, forgedPayload("key-forged",),);

      expect(result.ok,).toBe(false,);
      expect(result.ok ? null : result.stale,).toBe(true,);
    });

    test("a standard chat rejects the live key id when the ciphertext does not decrypt — forged, not recoverable", async () => {
      const chatId = "chat-validate-forged";
      await insertChats(db, "Chat", "user-1", { id: chatId, encryption_level: "standard", } as never,);
      const chatKey = await deriveChatKeyForChat(db, chatId, getSmkKeySafe(),);

      const result = await validateClientEncryptedPayload(db, chatId, forgedPayload(chatKey.keyId,),);

      expect(result.ok,).toBe(false,);
      expect(result.ok ? null : result.stale,).toBe(false,);
    });

    test("a standard chat accepts a payload that decrypts under its live key", async () => {
      const chatId = "chat-validate-ok";
      await insertChats(db, "Chat", "user-1", { id: chatId, encryption_level: "standard", } as never,);
      const chatKey = await deriveChatKeyForChat(db, chatId, getSmkKeySafe(),);
      const payload = await compressThenEncrypt({
        plaintext: "the quick brown fox",
        chatKey: chatKey.key,
        keyId: chatKey.keyId,
      },);

      expect(await validateClientEncryptedPayload(db, chatId, payload,),).toEqual({
        ok: true,
        keyId: chatKey.keyId,
      },);
    });

    test("a non-standard chat accepts the payload — the server holds no key to check it against", async () => {
      const chatId = "chat-validate-none";
      await insertChats(db, "Chat", "user-1", { id: chatId, encryption_level: "none", } as never,);

      expect(await validateClientEncryptedPayload(db, chatId, forgedPayload("key-forged",),),).toEqual({
        ok: true,
        keyId: "key-forged",
      },);
    });
  });
});
