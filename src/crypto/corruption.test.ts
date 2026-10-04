import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import { Kysely, } from "kysely";
import type { Migration, } from "kysely/migration";
import { Migrator, } from "kysely/migration";
import { readdirSync, } from "node:fs";
import path from "node:path";

import { createSqliteDialect, } from "../db";
import type { DB, } from "../db/schema";
import { decryptAtRest, encryptAtRest, } from "./at-rest";
import { isEncryptedPayload, } from "./pipeline";
import { initSmk, } from "./smk";

const VALID_HEX_KEY = "e".repeat(64,);
const USER_ID = "corruption-user-001";

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

describe("Crypto Corruption Resistance", () => {
  describe("decryptAtRest failure modes", () => {
    it("returns invalid JSON verbatim for at-rest tier (server is a passthrough)", async () => {
      const result = await decryptAtRest({
        database: db,
        chatId: "test",
        storedContent: "{ invalid json",
        encryptionLevel: "at-rest",
      },);

      expect(result,).toBe("{ invalid json",);
    });

    it("returns truncated payloads as-is for standard tier (not-a-payload legacy path)", async () => {
      await ensureChat("trunc-std",);
      const valid = await encryptAtRest({
        database: db,
        chatId: "trunc-std",
        plaintext: "test content",
        encryptionLevel: "standard",
      },);

      expect(isEncryptedPayload(valid.storedContent,),).toBeTrue();

      const corrupted = valid.storedContent.slice(0, valid.storedContent.length - 10,);
      expect(isEncryptedPayload(corrupted,),).toBeFalse();
      const result = await decryptAtRest({
        database: db,
        chatId: "trunc-std",
        storedContent: corrupted,
        encryptionLevel: "standard",
      },);

      expect(result,).toBe(corrupted,);
    });

    it("returns truncated payloads verbatim for at-rest tier (passthrough never throws)", async () => {
      await ensureChat("trunc-rest",);
      const valid = await encryptAtRest({
        database: db,
        chatId: "trunc-rest",
        plaintext: "test content",
        encryptionLevel: "standard",
      },);

      const corrupted = valid.storedContent.slice(0, valid.storedContent.length - 10,);
      const result = await decryptAtRest({
        database: db,
        chatId: "trunc-rest",
        storedContent: corrupted,
        encryptionLevel: "at-rest",
      },);

      expect(result,).toBe(corrupted,);
    });
  });

  describe("boundary conditions for encryptAtRest", () => {
    it("encrypts empty strings to a valid blob that round-trips", async () => {
      await ensureChat("empty-corrupt",);
      const result = await encryptAtRest({
        database: db,
        chatId: "empty-corrupt",
        plaintext: "",
        encryptionLevel: "standard",
      },);

      expect(result.wasEncrypted,).toBeTrue();
      expect(isEncryptedPayload(result.storedContent,),).toBeTrue();

      const roundTrip = await decryptAtRest({
        database: db,
        chatId: "empty-corrupt",
        storedContent: result.storedContent,
        encryptionLevel: "standard",
      },);

      expect(roundTrip,).toBe("",);
    });

    it("encrypts very long strings and round-trips them", async () => {
      await ensureChat("long-corrupt",);
      const longString = "a".repeat(10000,);
      const result = await encryptAtRest({
        database: db,
        chatId: "long-corrupt",
        plaintext: longString,
        encryptionLevel: "standard",
      },);

      expect(result.wasEncrypted,).toBeTrue();

      const roundTrip = await decryptAtRest({
        database: db,
        chatId: "long-corrupt",
        storedContent: result.storedContent,
        encryptionLevel: "standard",
      },);

      expect(roundTrip,).toBe(longString,);
    });
  });
});
