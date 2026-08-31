/**
 * Integration tests for crypto/at-rest.ts — tier-aware encryption enforcement.
 *
 * Coverage (post Phase D rename "private" → "at-rest"):
 *   1. `none` tier — stores plaintext as-is, no SMK needed
 *   2. `standard` tier — server-mediated AES via chat keys (existing pipeline)
 *   3. `at-rest` tier — server stores the wire payload as-is; no decrypt path
 *   4. `getChatEncryptionLevel` returns the DB value
 *   5. `isE2eOrEncrypted` recognises both envelopes
 */

import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Kysely, sql, } from "kysely";
import type { Migration, } from "kysely/migration";
import { Migrator, } from "kysely/migration";
import { readdirSync, } from "node:fs";
import path from "node:path";

import { createSqliteDialect, } from "../db";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { encryptAtRest, getChatEncryptionLevel, isE2eOrEncrypted, } from "./at-rest";
import { initSmk, } from "./smk";

const VALID_HEX_KEY = "b".repeat(64,);
const USER_ID = "at-rest-user-001";

let db: Kysely<DB>;

// Build a migration provider that scans all migration files. The
// migration specifier IS genuinely runtime-selected (readdirSync of
// src/db/migrations/); a static import would require hardcoding every
// filename. The only writeable alternative would be a generated barrel,
// which the project deliberately avoids.
/** */
function buildMigrationProvider(): {
  getMigrations: () => Promise<Record<string, Migration>>;
} {
  return {
    async getMigrations(): Promise<Record<string, Migration>> {
      const dir = path.join(__dirname, "..", "db", "migrations",);
      const files = readdirSync(dir,)
        .filter((f,) => f.endsWith(".ts",))
        .toSorted((a, b,) => a.localeCompare(b,));
      const migrations: Record<string, Migration> = {};
      for (const f of files) {
        const mod = (await import(path.join(dir, f,))) as
          | { default?: Migration }
          | Migration;
        const candidate = "default" in mod && mod.default ? mod.default : (mod as Migration);
        const key = f.endsWith(".ts",) ? f.slice(0, -3,) : f;
        migrations[key] = candidate;
      }
      return migrations;
    },
  };
}

beforeAll(async () => {
  createLogger({ level: "warn", },);
  await initSmk({
    serverEncryptionKey: VALID_HEX_KEY,
    required: false,
    compressThreshold: 1024,
    compressAlgorithm: "gzip",
  },);
  const sqlite = new Database(":memory:",);
  sqlite.run("PRAGMA foreign_keys = OFF",);
  db = new Kysely<DB>({ dialect: createSqliteDialect(sqlite,), },);
  const migrator = new Migrator({ db, provider: buildMigrationProvider(), },);
  const { error, } = await migrator.migrateToLatest();
  if (error) { throw new Error(`Migration failed: ${JSON.stringify(error,)}`,); }
  await db.insertInto("users",).values({
    id: USER_ID,
    username: USER_ID,
    display_name: USER_ID,
    password_hash: "dummy",
  },).execute();
},);

afterAll(async () => {
  await db.destroy();
},);

beforeEach(async () => {
  await sql`DELETE FROM chats`.execute(db,);
},);

describe("encryptAtRest — tier-aware path", () => {
  test("none tier: stores plaintext as-is", async () => {
    const chatId = "chat-none-001";
    await db.insertInto("chats",).values({
      id: chatId,
      name: chatId,
      type: "direct",
      mode: "direct",
      created_by: USER_ID,
      encryption_level: "none",
    },).execute();
    const result = await encryptAtRest({
      database: db,
      chatId,
      plaintext: "hello world",
      encryptionLevel: "none",
    },);
    expect(result.storedContent,).toBe("hello world",);
    expect(result.wasEncrypted,).toBe(false,);
    expect(result.keyId,).toBeNull();
  });

  test("standard tier: runs through server encrypt path (smoke)", async () => {
    const chatId = "chat-standard-001";
    await db.insertInto("chats",).values({
      id: chatId,
      name: chatId,
      type: "direct",
      mode: "direct",
      created_by: USER_ID,
      encryption_level: "standard",
    },).execute();
    const result = await encryptAtRest({
      database: db,
      chatId,
      plaintext: "message",
      encryptionLevel: "standard",
    },);
    // Tier contract: path completes; `result` shape is well-defined.
    expect(typeof result.storedContent,).toBe("string",);
    expect(typeof result.wasEncrypted,).toBe("boolean",);
    expect(result.keyId === null || typeof result.keyId === "string",).toBeTrue();
  });
});

describe("at-rest tier — wire-passthrough semantics", () => {
  test("at-rest tier: stores whatever the caller submits (server is a passthrough)", async () => {
    const chatId = "chat-at-rest-001";
    await db.insertInto("chats",).values({
      id: chatId,
      name: chatId,
      type: "direct",
      mode: "direct",
      created_by: USER_ID,
      encryption_level: "at-rest",
    },).execute();
    const wire = JSON.stringify({
      e2e: true,
      ciphertext: "opaque-blob",
      nonce: "x",
      senderEphPubJwk: { kty: "EC", },
      chainIndex: 0,
    },);
    const result = await encryptAtRest({
      database: db,
      chatId,
      plaintext: wire,
      encryptionLevel: "at-rest",
    },);
    expect(result.storedContent,).toBe(wire,);
    expect(result.wasEncrypted,).toBe(true,);
    expect(result.keyId,).toBeNull();
  });

  test("at-rest tier: any plaintext is stored verbatim (caller is responsible for pre-encrypt)", async () => {
    const wire = "the-server-stores-verbatim";
    const out = await encryptAtRest({
      database: db,
      chatId: "ignored",
      plaintext: wire,
      encryptionLevel: "at-rest",
    },);
    expect(out.storedContent,).toBe(wire,);
    expect(out.wasEncrypted,).toBe(true,);
  });
});

describe("getChatEncryptionLevel", () => {
  test("returns the DB value", async () => {
    const chatId = "chat-level-check";
    await db.insertInto("chats",).values({
      id: chatId,
      name: chatId,
      type: "direct",
      mode: "direct",
      created_by: USER_ID,
      encryption_level: "standard",
    },).execute();
    const level = await getChatEncryptionLevel(db, chatId,);
    expect(level,).toBe("standard",);
  });

  test("defaults to none for unknown chat", async () => {
    const level = await getChatEncryptionLevel(db, "nonexistent-chat-id",);
    expect(level,).toBe("none",);
  });
});

describe("isE2eOrEncrypted envelope detection", () => {
  test("returns true for at-rest envelope", () => {
    expect(isE2eOrEncrypted(JSON.stringify({ e2e: true, ciphertext: "abc", },),),)
      .toBeTrue();
  });

  test("returns true for server-encrypted envelope", () => {
    expect(isE2eOrEncrypted(JSON.stringify({ enc: "cipher", nonce: "n1", algo: "AES-GCM", },),),)
      .toBeTrue();
  });

  test("returns false for plain text", () => {
    expect(isE2eOrEncrypted("hello world",),).toBeFalse();
  });

  test("returns false for non-object JSON", () => {
    expect(isE2eOrEncrypted('["a","b"]',),).toBeFalse();
    expect(isE2eOrEncrypted("42",),).toBeFalse();
  });

  test("returns false for malformed JSON", () => {
    expect(isE2eOrEncrypted("{not-valid",),).toBeFalse();
  });

  test("returns false for empty input", () => {
    expect(isE2eOrEncrypted("",),).toBeFalse();
  });
});
