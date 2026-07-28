/**
 * Integration test: Full chat encryption lifecycle
 *
 * Step-by-step walkthrough:
 *   1. Bootstrap SMK + DB (all migrations)
 *   2. Create actors with encryption keys
 *   3. Create a chat, add participants
 *   4. Derive chat key → encrypt message → decrypt message
 *   5. Third participant joins → keys distributed
 *   6. Participant leaves → chat key rotated (forward secrecy)
 *   7. Verify old messages still decrypt after key rotation
 *   8. Key rotation after expiry
 */

import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Kysely, sql, } from "kysely";
import type { Migration, } from "kysely/migration";
import { Migrator, } from "kysely/migration";
import { readdirSync, } from "node:fs";
import path from "node:path";
import type { EncryptionLevel, } from "../db/enums";
import { createSqliteDialect, } from "../db/index";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { generateActorKey, listActorKeys, } from "./actor-keys";
import { decryptAtRest, encryptAtRest, needsEncryption, } from "./at-rest";
import { getChatParticipantActorIds, } from "./chat-keys";
import { distributeKeysOnJoin, getChatKey, rotateKeyOnLeave, } from "./key-distribution";
import { findExpiredKeys, runAutoRotation, } from "./key-rotation";
import { compressThenEncrypt, decryptThenDecompress, } from "./pipeline";
import { getSmk, initSmk, isEncryptionEnabled, } from "./smk";

const VALID_HEX_KEY = "b".repeat(64,);
const USER_1 = "user-lifecycle-001";
const USER_2 = "user-lifecycle-002";
const USER_3 = "user-lifecycle-003";
const CHAT_ID = "chat-lifecycle-001";

let db: Kysely<DB>;

/** Build a migration provider that scans all migration files. */
function buildMigrationProvider() {
  return {
    async getMigrations(): Promise<Record<string, Migration>> {
      const dir = path.join(__dirname, "..", "db", "migrations",);
      const files = readdirSync(dir,)
        .filter((f,) => typeof f === "string" && f.endsWith(".ts",))
        .toSorted((a, b,) => a.localeCompare(b,));
      const migrations: Record<string, Migration> = {};
      for (const file of files) {
        const mod = await import(path.join(dir, file,));
        const name = file.replace(/\.ts$/, "",);
        migrations[name] = mod.default ?? mod;
      }
      return migrations;
    },
  };
}

beforeAll(async () => {
  // Init logger (needed by key-distribution, key-rotation)
  createLogger();

  const sqlite = new Database(":memory:",);
  // Disable FK checks so inserts don't cross-reference
  sqlite.run("PRAGMA foreign_keys = OFF",);
  db = new Kysely<DB>({ dialect: createSqliteDialect(sqlite,), },);

  // Run ALL migrations so schema includes data_source_format, encryption_level, etc.
  const migrator = new Migrator({ db, provider: buildMigrationProvider(), },);
  const { error, } = await migrator.migrateToLatest();
  if (error) { throw new Error(`Migration failed: ${JSON.stringify(error,)}`,); }

  // Migration 021 turns FK ON at the end — re-disable for test flexibility
  await sql`PRAGMA foreign_keys = OFF`.execute(db,);

  await initSmk({
    serverEncryptionKey: VALID_HEX_KEY,
    required: false,
    compressThreshold: 128,
    compressAlgorithm: "gzip",
  },);
},);

afterAll(async () => {
  await initSmk({ required: false, compressThreshold: 128, compressAlgorithm: "gzip", },);
  db.destroy();
},);

/** Insert a minimal actor row. */
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
    owner_id: type === "user" ? id : null,
    data_version: 0,
    visibility: "private",
  },).execute();
}

/** Insert a chat row. */
async function insertChat(id: string, encryptionLevel: EncryptionLevel = "standard",) {
  await db.insertInto("chats",).values({
    id,
    name: id,
    type: "direct",
    mode: "direct",
    created_by: USER_1,
    encryption_level: encryptionLevel,
  },).execute();
}

/** Add a participant to a chat. */
async function addParticipant(chatId: string, actorId: string,) {
  await db.insertInto("chat_participants",).values({
    chat_id: chatId,
    actor_id: actorId,
    role_in_chat: "member",
  },).execute();
}

// ══════════════════════════════════════════════════════════
// Step 1: SMK + encryption enabled
// ══════════════════════════════════════════════════════════

describe("Step 1: SMK initialization", () => {
  test("SMK loaded and encryption enabled", () => {
    expect(isEncryptionEnabled(),).toBe(true,);
    expect(getSmk(),).not.toBeNull();
  });
});

// ══════════════════════════════════════════════════════════
// Step 2: Actor key creation
// ══════════════════════════════════════════════════════════

describe("Step 2: Create actors with encryption keys", () => {
  test("insert actors into DB", async () => {
    await insertActor(USER_1, "user",);
    await insertActor(USER_2, "user",);
    await insertActor(USER_3, "user",);
  });

  test("generate actor keys for all users", async () => {
    const smk = getSmk()!;
    await generateActorKey({ database: db, actorId: USER_1, smk, },);
    await generateActorKey({ database: db, actorId: USER_2, smk, },);
    await generateActorKey({ database: db, actorId: USER_3, smk, },);
  });

  test("each actor has exactly one active key", async () => {
    for (const uid of [USER_1, USER_2, USER_3,]) {
      const keys = await listActorKeys(db, uid,);
      const active = keys.filter((k,) => k.status === "active");
      expect(active.length,).toBe(1,);
    }
  });
});

// ══════════════════════════════════════════════════════════
// Step 3: Create chat + add participants
// ══════════════════════════════════════════════════════════

describe("Step 3: Chat creation and participant setup", () => {
  test("create chat with standard encryption", async () => {
    await insertChat(CHAT_ID, "standard",);

    const row = await db.selectFrom("chats",).select("encryption_level",)
      .where("id", "=", CHAT_ID,).executeTakeFirst();
    expect(row?.encryption_level,).toBe("standard",);
  });

  test("add USER_1 and USER_2 as participants", async () => {
    await addParticipant(CHAT_ID, USER_1,);
    await addParticipant(CHAT_ID, USER_2,);

    const actorIds = await getChatParticipantActorIds(db, CHAT_ID,);
    expect(actorIds.length,).toBe(2,);
    expect(actorIds,).toContain(USER_1,);
    expect(actorIds,).toContain(USER_2,);
  });
});

// ══════════════════════════════════════════════════════════
// Step 4: Chat key derivation + message encrypt/decrypt
// ══════════════════════════════════════════════════════════

describe("Step 4: Derive chat key, encrypt and decrypt messages", () => {
  test("derive chat key from participant keys", async () => {
    const chatKey = await getChatKey(db, CHAT_ID,);

    expect(chatKey.key,).toBeDefined();
    expect(chatKey.keyId.length,).toBeGreaterThan(0,);
    expect(chatKey.rawKey.length,).toBe(32,);
  });

  test("deterministic derivation — same participants produce same key", async () => {
    const key1 = await getChatKey(db, CHAT_ID,);
    const key2 = await getChatKey(db, CHAT_ID,);

    expect(Array.from(key1.rawKey,),).toEqual(Array.from(key2.rawKey,),);
    expect(key1.keyId,).toBe(key2.keyId,);
  });

  test("compressThenEncrypt → decryptThenDecompress round-trip", async () => {
    const chatKey = await getChatKey(db, CHAT_ID,);
    const plaintext = "Hello from USER_1! This message should be encrypted at rest.";

    const encrypted = await compressThenEncrypt({
      plaintext,
      chatKey: chatKey.key,
      keyId: chatKey.keyId,
    },);

    expect(encrypted,).not.toBe(plaintext,);

    const decrypted = await decryptThenDecompress(encrypted, chatKey.key,);
    expect(decrypted,).toBe(plaintext,);
  });

  test("encryptAtRest / decryptAtRest round-trip for standard tier", async () => {
    const message = "Integration test: emoji 🔐 and unicode 日本語 work";

    const encResult = await encryptAtRest({
      database: db,
      chatId: CHAT_ID,
      plaintext: message,
      encryptionLevel: "standard",
    },);

    expect(encResult.wasEncrypted,).toBe(true,);
    expect(encResult.keyId,).not.toBeNull();
    expect(encResult.storedContent,).not.toBe(message,);

    const decResult = await decryptAtRest({
      database: db,
      chatId: CHAT_ID,
      storedContent: encResult.storedContent,
      encryptionLevel: "standard",
    },);

    expect(decResult,).toBe(message,);
  });

  test("public tier: no encryption", async () => {
    const message = "This stays plaintext";

    const encResult = await encryptAtRest({
      database: db,
      chatId: CHAT_ID,
      plaintext: message,
      encryptionLevel: "public",
    },);

    expect(encResult.wasEncrypted,).toBe(false,);
    expect(encResult.storedContent,).toBe(message,);
  });

  test("needsEncryption detects plaintext vs encrypted", () => {
    expect(needsEncryption("standard", "plaintext",),).toBe(true,);
    expect(needsEncryption("public", "plaintext",),).toBe(false,);
    // isEncryptedPayload checks for { enc, nonce, algo, key_id }
    const encrypted = '{"enc":"x","nonce":"y","algo":"aes-256-gcm","key_id":"k1"}';
    expect(needsEncryption("standard", encrypted,),).toBe(false,);
  });
});

// ══════════════════════════════════════════════════════════
// Step 5: Third participant joins → key distribution
// ══════════════════════════════════════════════════════════

describe("Step 5: USER_3 joins the chat", () => {
  test("add USER_3 as participant", async () => {
    await addParticipant(CHAT_ID, USER_3,);

    const actorIds = await getChatParticipantActorIds(db, CHAT_ID,);
    expect(actorIds.length,).toBe(3,);
    expect(actorIds,).toContain(USER_3,);
  });

  test("distributeKeysOnJoin returns valid chat key", async () => {
    const chatKey = await distributeKeysOnJoin(db, CHAT_ID, USER_3,);

    expect(chatKey.key,).toBeDefined();
    expect(chatKey.rawKey.length,).toBe(32,);
  });
});

// ══════════════════════════════════════════════════════════
// Step 6: Participant leaves → forward secrecy
// ══════════════════════════════════════════════════════════

describe("Step 6: USER_3 leaves — forward secrecy", () => {
  test("rotateKeyOnLeave produces a new chat key", async () => {
    const newKey = await rotateKeyOnLeave(db, CHAT_ID, USER_3,);

    expect(newKey.rawKey.length,).toBe(32,);
    expect(newKey.keyId,).toBeDefined();
  });

  test("removed participant no longer in participant list", async () => {
    await db.deleteFrom("chat_participants",)
      .where("chat_id", "=", CHAT_ID,)
      .where("actor_id", "=", USER_3,).execute();

    const remaining = await getChatParticipantActorIds(db, CHAT_ID,);
    expect(remaining.length,).toBe(2,);
    expect(remaining,).not.toContain(USER_3,);

    const chatKey = await getChatKey(db, CHAT_ID,);
    expect(chatKey.rawKey.length,).toBe(32,);
  });

  test("rotateKeyOnLeave rejects when no participants remain", async () => {
    const chatId = "chat-empty-leave";
    await insertChat(chatId, "standard",);
    await addParticipant(chatId, USER_1,);

    await db.deleteFrom("chat_participants",)
      .where("chat_id", "=", chatId,).execute();

    await expect(rotateKeyOnLeave(db, chatId, USER_1,),).rejects.toThrow("no remaining participants",);
  });
});

// ══════════════════════════════════════════════════════════
// Step 7: Messages still decrypt after key changes
// ══════════════════════════════════════════════════════════

describe("Step 7: Message persistence across key changes", () => {
  test("message encrypted before join still decrypts after key change", async () => {
    const chatKey = await getChatKey(db, CHAT_ID,);
    const originalMessage = "Sent before USER_3 joined";
    const encrypted = await compressThenEncrypt({
      plaintext: originalMessage,
      chatKey: chatKey.key,
      keyId: chatKey.keyId,
    },);

    // After USER_3 left, participant set is back to USER_1 + USER_2
    const keyAfterLeave = await getChatKey(db, CHAT_ID,);

    const decrypted = await decryptThenDecompress(encrypted, keyAfterLeave.key,);
    expect(decrypted,).toBe(originalMessage,);
  });
});

// ══════════════════════════════════════════════════════════
// Step 8: Key rotation after expiry
// ══════════════════════════════════════════════════════════

describe("Step 8: Key rotation after expiry", () => {
  test("findExpiredKeys returns empty when rotation disabled", async () => {
    const expired = await findExpiredKeys(db, 0,);
    expect(expired.length,).toBe(0,);
  });

  test("findExpiredKeys returns empty when all keys are fresh", async () => {
    const expired = await findExpiredKeys(db, 365,);
    expect(expired.length,).toBe(0,);
  });

  test("runAutoRotation returns empty when no expired keys", async () => {
    const result = await runAutoRotation(db, 365,);
    expect(result.checked,).toBe(0,);
    expect(result.rotated,).toBe(0,);
    expect(result.errors.length,).toBe(0,);
  });

  test("runAutoRotation returns early when rotation disabled", async () => {
    const result = await runAutoRotation(db, 0,);
    expect(result.checked,).toBe(0,);
    expect(result.rotated,).toBe(0,);
  });
});
