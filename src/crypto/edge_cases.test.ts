import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";
import type { Migration, } from "kysely/migration";
import { Migrator, } from "kysely/migration";
import { readdirSync, } from "node:fs";
import path from "node:path";

import { createSqliteDialect, } from "../db";
import type { DB, } from "../db/schema";
import { decryptAtRest, encryptAtRest, } from "./at-rest";
import { extractKeyIdFromPayload, isEncryptedPayload, } from "./pipeline";
import { initSmk, } from "./smk";

const VALID_HEX_KEY = "c".repeat(64,);
const USER_ID = "edge-cases-user-001";

let db: Kysely<DB>;

// The migration specifier IS genuinely runtime-selected (readdirSync of
// src/db/migrations/); a static import would require hardcoding every
// filename. This matches the pattern in at-rest.integration.test.ts.
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

/**
 * chat_keys.chat_id references chats.id — standard-tier encryption derives
 * (and inserts) a chat key, so the parent chat row must exist first.
 * @param chatId
 */
async function ensureChat(chatId: string,): Promise<void> {
  await db.insertInto("chats",).values({
    id: chatId,
    name: chatId,
    type: "direct",
    mode: "direct",
    created_by: USER_ID,
    encryption_level: "standard",
  },).execute();
}

describe("Crypto Edge Case Tests", () => {
  describe("Recursive Encryption", () => {
    test("re-encrypting an encrypted payload is a passthrough, not double encryption", async () => {
      await ensureChat("depth-0",);
      const first = await encryptAtRest({
        database: db,
        chatId: "depth-0",
        plaintext: "original_plaintext",
        encryptionLevel: "standard",
      },);
      expect(first.wasEncrypted,).toBeTrue();
      expect(isEncryptedPayload(first.storedContent,),).toBeTrue();

      const second = await encryptAtRest({
        database: db,
        chatId: "depth-1",
        plaintext: first.storedContent,
        encryptionLevel: "standard",
      },);
      expect(second.wasEncrypted,).toBeTrue();
      expect(second.storedContent,).toBe(first.storedContent,);
      expect(second.keyId,).toBe(first.keyId,);

      const roundTrip = await decryptAtRest({
        database: db,
        chatId: "depth-1",
        storedContent: second.storedContent,
        encryptionLevel: "standard",
      },);
      expect(roundTrip,).toBe("original_plaintext",);
    });

    test("at-rest tier stores a standard payload verbatim", async () => {
      await ensureChat("l1",);
      const level1 = await encryptAtRest({
        database: db,
        chatId: "l1",
        plaintext: "secret",
        encryptionLevel: "standard",
      },);
      expect(level1.wasEncrypted,).toBeTrue();

      const level2 = await encryptAtRest({
        database: db,
        chatId: "l2",
        plaintext: level1.storedContent,
        encryptionLevel: "at-rest",
      },);

      expect(level2.wasEncrypted,).toBeTrue();
      expect(level2.storedContent,).toBe(level1.storedContent,);
      expect(extractKeyIdFromPayload(level2.storedContent,),).toBe(level1.keyId,);
    });
  });

  describe("Data Integrity & Corruption", () => {
    test("empty string encrypts to a valid blob and round-trips", async () => {
      await ensureChat("empty-test",);
      const result = await encryptAtRest({
        database: db,
        chatId: "empty-test",
        plaintext: "",
        encryptionLevel: "standard",
      },);
      expect(result.wasEncrypted,).toBeTrue();
      expect(isEncryptedPayload(result.storedContent,),).toBeTrue();

      const roundTrip = await decryptAtRest({
        database: db,
        chatId: "empty-test",
        storedContent: result.storedContent,
        encryptionLevel: "standard",
      },);
      expect(roundTrip,).toBe("",);
    });

    test("non-printable characters round-trip", async () => {
      await ensureChat("weird-chars",);
      const weirdChars = "\x00\x01\xff\xfe\x0b\r\n";
      const result = await encryptAtRest({
        database: db,
        chatId: "weird-chars",
        plaintext: weirdChars,
        encryptionLevel: "standard",
      },);
      expect(result.wasEncrypted,).toBeTrue();

      const roundTrip = await decryptAtRest({
        database: db,
        chatId: "weird-chars",
        storedContent: result.storedContent,
        encryptionLevel: "standard",
      },);
      expect(roundTrip,).toBe(weirdChars,);
    });

    test("non-string plaintext rejects with TypeError", async () => {
      expect(
        encryptAtRest({
          database: db,
          chatId: "number-test",
          plaintext: 12345 as unknown as string,
          encryptionLevel: "standard",
        },),
      ).rejects.toThrow(TypeError,);
    });

    test("non-string storedContent rejects with TypeError", async () => {
      expect(
        decryptAtRest({
          database: db,
          chatId: "number-test",
          storedContent: 12345 as unknown as string,
          encryptionLevel: "standard",
        },),
      ).rejects.toThrow(TypeError,);
    });
  });
});
