/**
 * Tests for crypto/chat-keys.ts — Chat key derivation via HKDF
 */
import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Kysely, sql } from "kysely";
import type { Migration } from "kysely/migration";
import { Migrator } from "kysely/migration";
import { readdirSync } from "node:fs";
import path from "node:path";
import { createSqliteDialect, } from "../db/index";
import type { DB, } from "../db/schema";
import { generateActorKey, loadActorKeys, } from "./actor-keys";
import { deriveChatKey, deriveChatKeyForChat, getChatParticipantActorIds, } from "./chat-keys";
import { getSmk, initSmk, } from "./smk";

const VALID_HEX_KEY = "a".repeat(64,);
const CHAT_ID = "chat-test-001";
const ACTOR_A = "actor-chat-a";
const ACTOR_B = "actor-chat-b";

let db: Kysely<DB>;

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
        const dir = path.join(__dirname, '..', 'db', 'migrations');
        const fileNames = readdirSync(dir).filter((f) => f.endsWith('.ts')).sort();
        const migrations: Record<string, Migration> = {};
        for (const fileName of fileNames) {
          const mod = await import(path.join(dir, fileName));
          migrations[fileName.replace(/\.ts$/, '')] = mod.default ?? mod;
        }
        return migrations;
      },
    },
  });
  const { error } = await migrator.migrateToLatest();
  if (error) throw new Error('Migration failed: ' + JSON.stringify(error));
  await sql`PRAGMA foreign_keys = OFF`.execute(db);  await initSmk({
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
});
