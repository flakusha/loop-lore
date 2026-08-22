/**
 * Integration test: Chat history survives participant join/leave
 *
 * BUG: BUG-chat-key-history-loss-join-leave (issue 61c7072)
 *
 * Verifies that encrypted messages remain decryptable after participants
 * join and leave — the chat key is STABLE across membership changes.
 *
 * Flow:
 *   1. USER_1 + USER_2 create chat, post 2 messages
 *   2. USER_3 joins via distributeKeysOnJoin — history still decrypts
 *   3. USER_1 leaves via rotateKeyOnLeave — history still decrypts
 *   4. Verify all messages decrypt to original plaintext
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
import { generateActorKey, } from "./actor-keys";
import { getChatParticipantActorIds, } from "./chat-keys";
import { distributeKeysOnJoin, getChatKey, rotateKeyOnLeave, } from "./key-distribution";
import { compressThenEncrypt, decryptThenDecompress, } from "./pipeline";
import { getSmk, initSmk, } from "./smk";

const VALID_HEX_KEY = "b".repeat(64,);
const USER_1 = "user-membership-001";
const USER_2 = "user-membership-002";
const USER_3 = "user-membership-003";
const CHAT_ID = "chat-membership-001";

let db: Kysely<DB>;

function buildMigrationProvider() {
  return {
    async getMigrations(): Promise<Record<string, Migration>> {
      const dir = path.join(__dirname, "..", "db", "migrations",);
      const fileNames = readdirSync(dir,)
        .filter((f,) => f?.endsWith(".ts",) ?? false)
        .sort((a, b,) => (a ?? "") < (b ?? "") ? -1 : ((a ?? "") > (b ?? "") ? 1 : 0));
      const migrations: Record<string, Migration> = {};
      for (const fileName of fileNames) {
        migrations[fileName.replace(/\.ts$/, "",)] = mod.default ?? mod;
      }
      return migrations;
    },
  };
}

beforeAll(async () => {
  createLogger();
  const sqlite = new Database(":memory:",);
  sqlite.run("PRAGMA foreign_keys = OFF",);
  db = new Kysely<DB>({ dialect: createSqliteDialect(sqlite,), },);
  const migrator = new Migrator({ db, provider: buildMigrationProvider(), },);
  const { error, } = await migrator.migrateToLatest();
  if (error) { throw new Error(`Migration failed: ${JSON.stringify(error,)}`,); }
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
    format_version: 0,
    visibility: "private",
  },).execute();
}

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

async function addParticipant(chatId: string, actorId: string,) {
  await db.insertInto("chat_participants",).values({
    chat_id: chatId,
    actor_id: actorId,
    role_in_chat: "member",
  },).execute();
}

async function encryptMessage(chatId: string, plaintext: string, actorId: string,) {
  const chatKey = await getChatKey(db, chatId,);
  const encrypted = await compressThenEncrypt({
    plaintext,
    chatKey: chatKey.key,
    keyId: chatKey.keyId,
  },);
  await db.insertInto("messages",).values({
    id: crypto.randomUUID(),
    chat_id: chatId,
    actor_id: actorId,
    role: "user",
    content: encrypted,
    content_encoding: "identity",
    key_id: chatKey.keyId,
    status: "confirmed",
    visibility: "visible",
  },).execute();
}

async function decryptByKeyId(content: string, keyId: string,): Promise<string> {
  const { getChatKeyById, } = await import("./chat-keys");
  const chatKey = await getChatKeyById(db, keyId, getSmk()!,);
  if (!chatKey) { throw new Error(`Chat key not found: ${keyId}`,); }
  return decryptThenDecompress(content, chatKey.key,);
}

// ══════════════════════════════════════════════════════════
// Bootstrap
// ══════════════════════════════════════════════════════════

describe("Chat history survival across membership changes", () => {
  test("create actors, chat, and initial messages", async () => {
    await insertActor(USER_1, "user",);
    await insertActor(USER_2, "user",);
    await insertActor(USER_3, "user",);

    await insertChat(CHAT_ID, "standard",);
    await addParticipant(CHAT_ID, USER_1,);
    await addParticipant(CHAT_ID, USER_2,);

    const smk = getSmk()!;
    await generateActorKey({ database: db, actorId: USER_1, smk, name: "primary", },);
    await generateActorKey({ database: db, actorId: USER_2, smk, name: "primary", },);
    await generateActorKey({ database: db, actorId: USER_3, smk, name: "primary", },);

    await encryptMessage(CHAT_ID, "Hello from USER_1", USER_1,);
    await encryptMessage(CHAT_ID, "Hello from USER_2", USER_2,);

    const msgs = await db
      .selectFrom("messages",)
      .select(["id", "content", "key_id",],)
      .where("chat_id", "=", CHAT_ID,)
      .execute();
    expect(msgs.length,).toBe(2,);
    for (const msg of msgs) {
      expect(msg.key_id,).not.toBeNull();
    }
  });

  test("USER_3 joins — history is still decryptable", async () => {
    await addParticipant(CHAT_ID, USER_3,);

    // distributeKeysOnJoin does NOT re-encrypt — chat key is stable
    const chatKey = await distributeKeysOnJoin(db, CHAT_ID, USER_3,);
    expect(chatKey.key,).toBeDefined();

    const actorIds = await getChatParticipantActorIds(db, CHAT_ID,);
    expect(actorIds.length,).toBe(3,);

    const msgs = await db
      .selectFrom("messages",)
      .select(["content", "key_id",],)
      .where("chat_id", "=", CHAT_ID,)
      .execute();

    const decrypted = await Promise.all(
      msgs.map((msg,) => decryptByKeyId(msg.content, msg.key_id ?? "",)),
    );
    expect(decrypted,).toContain("Hello from USER_1",);
    expect(decrypted,).toContain("Hello from USER_2",);
  });

  test("USER_1 leaves — rotateKeyOnLeave re-encrypts history, still decryptable", async () => {
    const msgsBefore = await db
      .selectFrom("messages",)
      .select(["id", "content", "key_id",],)
      .where("chat_id", "=", CHAT_ID,)
      .execute();

    const keyIdsBefore = msgsBefore.map((m,) => m.key_id);

    // rotateKeyOnLeave generates new random key and re-encrypts all messages
    const newChatKey = await rotateKeyOnLeave(db, CHAT_ID, USER_1,);
    expect(newChatKey.rawKey.length,).toBe(32,);

    const msgsAfter = await db
      .selectFrom("messages",)
      .select(["content", "key_id",],)
      .where("chat_id", "=", CHAT_ID,)
      .execute();

    for (const msg of msgsAfter) {
      expect(msg.key_id,).not.toBeNull();
      const plaintext = await decryptByKeyId(msg.content, msg.key_id ?? "",);
      expect(["Hello from USER_1", "Hello from USER_2",],).toContain(plaintext,);
    }

    // Old key_ids must not remain
    const keyIdsAfter = msgsAfter.map((m,) => m.key_id);
    for (const oldKeyId of keyIdsBefore) {
      expect(keyIdsAfter,).not.toContain(oldKeyId,);
    }
  });

  test("after rotation, all messages still decrypt", async () => {
    const msgs = await db
      .selectFrom("messages",)
      .select(["content", "key_id",],)
      .where("chat_id", "=", CHAT_ID,)
      .execute();

    for (const msg of msgs) {
      if (!msg.key_id) { continue; }
      const plaintext = await decryptByKeyId(msg.content, msg.key_id ?? "",);
      expect(["Hello from USER_1", "Hello from USER_2",],).toContain(plaintext,);
    }
  });

  test("new messages after rotation encrypt with current chat key", async () => {
    const chatKey = await getChatKey(db, CHAT_ID,);
    const newMsgContent = "Message after rotation";
    await encryptMessage(CHAT_ID, newMsgContent, USER_2,);

    const latestMsg = await db
      .selectFrom("messages",)
      .select(["content", "key_id",],)
      .orderBy("created_at", "desc",)
      .limit(1,)
      .executeTakeFirst();

    expect(latestMsg!.key_id,).toBe(chatKey.keyId,);
    const plaintext = await decryptByKeyId(latestMsg!.content, latestMsg!.key_id ?? "",);
    expect(plaintext,).toBe(newMsgContent,);
  });
});
