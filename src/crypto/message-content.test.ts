/**
 * Tests for crypto/message-content.ts — the shared message-content
 * encrypt/decrypt helpers used by every write/read path.
 */
import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Kysely, sql, } from "kysely";
import { type Migration, Migrator, } from "kysely/migration";
import { readdirSync, } from "node:fs";
import path from "node:path";
import { createSqliteDialect, } from "../db/index";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { deriveChatKeyForChat, } from "./chat-keys";
import {
  decryptMessageContent,
  encryptMessageContent,
  type MessageContentRef,
} from "./message-content";
import { getSmk, initSmk, } from "./smk";

const VALID_HEX_KEY = "b".repeat(64,);
const ACTOR_ID = "actor-mc-001";
const CHAT_ID = "chat-mc-001";
const OTHER_CHAT_ID = "chat-mc-002";

let testDb: Kysely<DB>;

/** Build a migration provider that scans all migration files (full schema). */
function buildMigrationProvider() {
  return {
    async getMigrations(): Promise<Record<string, Migration>> {
      const dir = path.join(import.meta.dir, "..", "db", "migrations",);
      const files = readdirSync(dir,)
        .filter((f,) => typeof f === "string" && f.endsWith(".ts",))
        .toSorted((a, b,) => a.localeCompare(b,));
      const migrations: Record<string, Migration> = {};
      for (const file of files) {
        const mod = await import(path.join(dir, file,));
        migrations[file.replace(/\.ts$/, "",)] = mod.default ?? mod;
      }
      return migrations;
    },
  };
}

beforeAll(async () => {
  createLogger({ level: "warn", },);
  const sqlite = new Database(":memory:",);
  sqlite.run("PRAGMA foreign_keys = OFF",);
  testDb = new Kysely<DB>({ dialect: createSqliteDialect(sqlite,), },);
  const migrator = new Migrator({ db: testDb, provider: buildMigrationProvider(), },);
  const { error, } = await migrator.migrateToLatest();
  if (error) { throw new Error(`Migration failed: ${JSON.stringify(error,)}`,); }
  await sql`PRAGMA foreign_keys = OFF`.execute(testDb,);
  await initSmk({
    serverEncryptionKey: VALID_HEX_KEY,
    required: false,
    compressThreshold: 128,
    compressAlgorithm: "gzip",
  },);

  await testDb.insertInto("actors",).values({
    id: ACTOR_ID,
    actor_type: "user",
    display_name: "MC Actor",
    agent_type: "none",
    settings: "{}",
    import_spec: "raw",
    data_source_format: "json",
    data_raw: null,
    user_id: ACTOR_ID,
    owner_id: ACTOR_ID,
    format_version: 0,
    visibility: "private",
  },).execute();

  for (const chatId of [CHAT_ID, OTHER_CHAT_ID,]) {
    await testDb.insertInto("chats",).values({
      id: chatId,
      name: chatId,
      type: "direct",
      mode: "direct",
      created_by: ACTOR_ID,
      encryption_level: "standard",
    },).execute();
    await testDb.insertInto("chat_participants",).values({
      chat_id: chatId,
      actor_id: ACTOR_ID,
    },).execute();
  }
},);

afterAll(async () => {
  // Reset SMK global so later test files don't inherit our active key.
  await initSmk({ required: false, compressThreshold: 128, compressAlgorithm: "gzip", },);
  await testDb.destroy();
},);

describe("encryptMessageContent / decryptMessageContent", () => {
  test("round-trips an encrypted message body through the shared helper", async () => {
    const smk = getSmk()!;
    const plaintext = "The dragon hoards gold beneath the mountain. ";

    const enc = await encryptMessageContent({
      database: testDb,
      chatId: CHAT_ID,
      actorId: ACTOR_ID,
      plaintext,
      smk,
    },);
    expect(enc.keyId,).toBeTruthy();
    expect(enc.storedContent,).not.toContain("dragon",); // not plaintext at rest

    const ref: MessageContentRef = {
      content: enc.storedContent,
      content_encoding: "identity",
      key_id: enc.keyId,
      chat_id: CHAT_ID,
    };
    const decrypted = await decryptMessageContent(testDb, ref, smk,);
    expect(decrypted,).toBe(plaintext,);
  });

  test("returns raw content unchanged for identity (unencrypted) rows", async () => {
    const smk = getSmk()!;
    const ref: MessageContentRef = {
      content: "hello world",
      content_encoding: "identity",
      key_id: null,
      chat_id: CHAT_ID,
    };
    expect(await decryptMessageContent(testDb, ref, smk,),).toBe("hello world",);
  });

  test("ensures the actor key exists before deriving the chat key", async () => {
    const smk = getSmk()!;
    // A second actor with no actor_keys row pre-seeded.
    const newActor = "actor-mc-002";
    await testDb.insertInto("actors",).values({
      id: newActor,
      actor_type: "user",
      display_name: "MC Actor 2",
      agent_type: "none",
      settings: "{}",
      import_spec: "raw",
      data_source_format: "json",
      data_raw: null,
      user_id: newActor,
      owner_id: newActor,
      format_version: 0,
      visibility: "private",
    },).execute();
    await testDb.insertInto("chat_participants",).values({
      chat_id: OTHER_CHAT_ID,
      actor_id: newActor,
    },).execute();

    // Should not throw — ensureActorKey provisions the missing actor key.
    const enc = await encryptMessageContent({
      database: testDb,
      chatId: OTHER_CHAT_ID,
      actorId: newActor,
      plaintext: "secrets",
      smk,
    },);
    await expect(deriveChatKeyForChat(testDb, OTHER_CHAT_ID, smk,),).resolves.toBeDefined();
    expect(enc.keyId,).toBeTruthy();
  });
});
