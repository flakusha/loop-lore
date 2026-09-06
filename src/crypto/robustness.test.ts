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
import { isEncryptedPayload, } from "./pipeline";
import { initSmk, } from "./smk";

const VALID_HEX_KEY = "d".repeat(64,);
const USER_ID = "robustness-user-001";

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

describe("Crypto Robustness Tests", () => {
  describe("Robustness in encryptAtRest", () => {
    test("1MB compressible payload encrypts and round-trips", async () => {
      await ensureChat("test-large",);
      const hugeString = "a".repeat(1_000_000,);
      const result = await encryptAtRest({
        database: db,
        chatId: "test-large",
        plaintext: hugeString,
        encryptionLevel: "standard",
      },);
      expect(result.wasEncrypted,).toBeTrue();
      expect(isEncryptedPayload(result.storedContent,),).toBeTrue();

      const roundTrip = await decryptAtRest({
        database: db,
        chatId: "test-large",
        storedContent: result.storedContent,
        encryptionLevel: "standard",
      },);
      expect(roundTrip.length,).toBe(1_000_000,);
      expect(roundTrip,).toBe(hugeString,);
    });

    test("large incompressible payload round-trips without compression", async () => {
      await ensureChat("test-random",);
      const randomBytes = crypto.getRandomValues(new Uint8Array(100_000,),);
      const randomString = Buffer.from(randomBytes,).toString("base64",);
      const result = await encryptAtRest({
        database: db,
        chatId: "test-random",
        plaintext: randomString,
        encryptionLevel: "standard",
      },);
      expect(result.wasEncrypted,).toBeTrue();

      const roundTrip = await decryptAtRest({
        database: db,
        chatId: "test-random",
        storedContent: result.storedContent,
        encryptionLevel: "standard",
      },);
      expect(roundTrip,).toBe(randomString,);
    });

    test("non-string input rejects with TypeError instead of silent coercion", async () => {
      expect(
        encryptAtRest({
          database: db,
          chatId: "test-number",
          plaintext: 12345 as unknown as string,
          encryptionLevel: "standard",
        },),
      ).rejects.toThrow(TypeError,);
    });
  });

  describe("Error propagation in decryptAtRest", () => {
    test("malformed JSON with standard tier returns legacy plaintext as-is", async () => {
      const result = await decryptAtRest({
        database: db,
        chatId: "test-invalid",
        storedContent: "{ invalid: json ",
        encryptionLevel: "standard",
      },);
      expect(result,).toBe("{ invalid: json ",);
    });

    test("tampered ciphertext fails closed instead of returning garbage", async () => {
      await ensureChat("test-key",);
      const enc = await encryptAtRest({
        database: db,
        chatId: "test-key",
        plaintext: "integrity-probe",
        encryptionLevel: "standard",
      },);
      expect(enc.keyId,).not.toBeNull();

      const payload = JSON.parse(enc.storedContent,) as { enc: string };
      const current = payload.enc[5];
      const swapped = current === "A" ? "B" : "A";
      const tampered = { ...payload, enc: payload.enc.slice(0, 5,) + swapped + payload.enc.slice(6,), };
      expect(isEncryptedPayload(JSON.stringify(tampered,),),).toBeTrue();

      await expect(
        decryptAtRest({
          database: db,
          chatId: "test-key",
          storedContent: JSON.stringify(tampered,),
          encryptionLevel: "standard",
        },),
      ).rejects.toThrow("Decryption failed",);
    });

    test("at-rest tier returns malformed JSON verbatim", async () => {
      const result = await decryptAtRest({
        database: db,
        chatId: "test-invalid",
        storedContent: "{ invalid: json ",
        encryptionLevel: "at-rest",
      },);
      expect(result,).toBe("{ invalid: json ",);
    });
  });
});
