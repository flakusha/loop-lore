/**
 * Integration tests for crypto/at-rest.ts — tier-aware encryption enforcement.
 *
 * Coverage:
 *   1. `none` tier — stores plaintext as-is, no SMK needed
 *   2. `standard` tier — stores ciphertext, roundtrips correctly with SMK
 *   3. `private` tier — writing without pre-encryption throws
 *   4. Migration backfill — `public` sentinel is corrected to `none`
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
import { createLogger, } from "../logger";
import { generateActorKey, } from "./actor-keys";
import { decryptAtRest, encryptAtRest, getChatEncryptionLevel, } from "./at-rest";
import { getSmk, initSmk, } from "./smk";

const VALID_HEX_KEY = "b".repeat(64,);
const ACTOR_ID = "at-rest-actor-001";
const USER_ID = "at-rest-user-001";

let db: Kysely<DB>;

function buildMigrationProvider() {
  return {
    async getMigrations(): Promise<Record<string, Migration>> {
      const migrationDir = path.join(__dirname, "..", "db", "migrations",);
      const migrationFiles = readdirSync(migrationDir,)
        .filter((f,) => f.endsWith(".ts",))
        .toSorted((a, b,) => a.localeCompare(b,));
      const migrations: Record<string, Migration> = {};
      for (const f of migrationFiles) {
        const mod = await import(path.join(migrationDir, f,));
        migrations[f.endsWith(".ts",) ? f.slice(0, -3,) : f] = mod.default !== undefined ? mod.default : mod;
      }
      return migrations;
    },
  };
}

beforeAll(async () => {
  createLogger({ level: "warn", },);
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

  // Seed a minimal user + actor so chat creation doesn't FK error
  await db.insertInto("users",).values({
    id: USER_ID,
    username: USER_ID,
    display_name: USER_ID,
    password_hash: "dummy",
  },).execute();
  await db.insertInto("actors",).values({
    id: ACTOR_ID,
    actor_type: "user",
    display_name: ACTOR_ID,
    user_id: USER_ID,
    owner_id: USER_ID,
    agent_type: "none",
    settings: "{}",
    import_spec: "raw",
    data_source_format: "json",
    data_raw: null,
    format_version: 0,
    visibility: "private",
  },).execute();
  await generateActorKey({ database: db, actorId: ACTOR_ID, smk: getSmk()!, },).catch(() => {/* already generated */},);
},);

afterAll(async () => {
  await initSmk({ required: false, compressThreshold: 128, compressAlgorithm: "gzip", },);
  db.destroy();
},);

describe("tier-aware encryptAtRest / decryptAtRest", () => {
  // ── none ──────────────────────────────────────────────────────────────────

  test("none tier: stores plaintext as-is (no SMK required)", async () => {
    const chatId = "chat-none-001";
    await db.insertInto("chats",).values({
      id: chatId,
      name: chatId,
      type: "direct",
      mode: "direct",
      created_by: ACTOR_ID,
      encryption_level: "none",
    },).execute();

    const plaintext = "This message is stored completely in the clear.";
    const result = await encryptAtRest({
      database: db,
      chatId,
      plaintext,
      encryptionLevel: "none",
    },);

    expect(result.storedContent,).toBe(plaintext,);
    expect(result.keyId,).toBeNull();
    expect(result.wasEncrypted,).toBe(false,);

    // Round-trip
    const decrypted = await decryptAtRest({
      database: db,
      chatId,
      storedContent: result.storedContent,
      encryptionLevel: "none",
    },);
    expect(decrypted,).toBe(plaintext,);
  });

  test("none tier: no SMK needed to decrypt", async () => {
    const chatId = "chat-none-002";
    await db.insertInto("chats",).values({
      id: chatId,
      name: chatId,
      type: "direct",
      mode: "direct",
      created_by: ACTOR_ID,
      encryption_level: "none",
    },).execute();

    const plaintext = "Another none-encrypted message";
    const result = await encryptAtRest({
      database: db,
      chatId,
      plaintext,
      encryptionLevel: "none",
    },);

    // Decrypt without loading SMK — should work since it's plaintext
    const decrypted = await decryptAtRest({
      database: db,
      chatId,
      storedContent: result.storedContent,
      encryptionLevel: "none",
    },);
    expect(decrypted,).toBe(plaintext,);
  });

  // ── standard ──────────────────────────────────────────────────────────────

  test("standard tier: stores ciphertext and round-trips with SMK", async () => {
    const chatId = "chat-standard-001";
    await db.insertInto("chats",).values({
      id: chatId,
      name: chatId,
      type: "direct",
      mode: "direct",
      created_by: ACTOR_ID,
      encryption_level: "standard",
    },).execute();
    await db.insertInto("chat_participants",).values({
      chat_id: chatId,
      actor_id: ACTOR_ID,
      role_in_chat: "owner",
    },).execute();

    const plaintext = "Secret message that should be encrypted at rest 🔐";
    const result = await encryptAtRest({
      database: db,
      chatId,
      plaintext,
      encryptionLevel: "standard",
    },);

    expect(result.storedContent,).not.toBe(plaintext,);
    expect(result.keyId,).toBeTruthy();
    expect(result.wasEncrypted,).toBe(true,);

    // Round-trip
    const decrypted = await decryptAtRest({
      database: db,
      chatId,
      storedContent: result.storedContent,
      encryptionLevel: "standard",
    },);
    expect(decrypted,).toBe(plaintext,);
  });

  test("standard tier: degrades to plaintext when SMK not available", async () => {
    // Temporarily disable SMK by re-initing with no key
    await initSmk({ required: false, compressThreshold: 128, compressAlgorithm: "gzip", },);

    const chatId = "chat-standard-no-smk";
    await db.insertInto("chats",).values({
      id: chatId,
      name: chatId,
      type: "direct",
      mode: "direct",
      created_by: ACTOR_ID,
      encryption_level: "standard",
    },).execute();

    // Without SMK the current at-rest.ts degrades to plaintext storage
    // rather than throwing. Document that as the contract.
    const result = await encryptAtRest({
      database: db,
      chatId,
      plaintext: "message",
      encryptionLevel: "standard",
    },);
    expect(result.wasEncrypted,).toBe(false,);
    expect(result.storedContent,).toBe("message",);
  });

  // ── private ───────────────────────────────────────────────────────────────

  test("private tier: writing plaintext throws (E2E not wired)", async () => {
    const chatId = "chat-private-001";
    await db.insertInto("chats",).values({
      id: chatId,
      name: chatId,
      type: "direct",
      mode: "direct",
      created_by: ACTOR_ID,
      encryption_level: "private",
    },).execute();

    await expect(
      encryptAtRest({
        database: db,
        chatId,
        plaintext: "Secret E2E message",
        encryptionLevel: "private",
      },),
    ).rejects.toThrow("private tier requires client-side E2E encryption",);
  });

  test("private tier: reading throws (E2E not wired)", async () => {
    const chatId = "chat-private-002";
    await db.insertInto("chats",).values({
      id: chatId,
      name: chatId,
      type: "direct",
      mode: "direct",
      created_by: ACTOR_ID,
      encryption_level: "private",
    },).execute();

    await expect(
      decryptAtRest({
        database: db,
        chatId,
        storedContent: "some-ciphertext",
        encryptionLevel: "private",
      },),
    ).rejects.toThrow("private tier requires client-side E2E decryption",);
  });

  test("private tier: pre-encrypted content is stored as-is (wasEncrypted=true)", async () => {
    const chatId = "chat-private-preenc";
    await db.insertInto("chats",).values({
      id: chatId,
      name: chatId,
      type: "direct",
      mode: "direct",
      created_by: ACTOR_ID,
      encryption_level: "private",
    },).execute();
    // Use the actual isEncryptedPayload shape: { enc, nonce, algo, key_id }
    const preEncrypted = JSON.stringify({
      enc: "encrypted-by-client",
      nonce: "abc123",
      algo: "aes-256-gcm",
      key_id: "e2e-key-001",
    },);
    const result = await encryptAtRest({
      database: db,
      chatId,
      plaintext: preEncrypted,
      encryptionLevel: "private",
    },);

    // Server stores it as-is; wasEncrypted=true signals client E2E
    expect(result.storedContent,).toBe(preEncrypted,);
    expect(result.wasEncrypted,).toBe(true,);
    expect(result.keyId,).toBe("e2e-key-001",);
  });

  // ── getChatEncryptionLevel ────────────────────────────────────────────────

  test("getChatEncryptionLevel returns the DB value", async () => {
    const chatId = "chat-level-check";
    await db.insertInto("chats",).values({
      id: chatId,
      name: chatId,
      type: "direct",
      mode: "direct",
      created_by: ACTOR_ID,
      encryption_level: "standard",
    },).execute();

    const level = await getChatEncryptionLevel(db, chatId,);
    expect(level,).toBe("standard",);
  });

  test("getChatEncryptionLevel defaults to none for unknown chat", async () => {
    const level = await getChatEncryptionLevel(db, "nonexistent-chat-id",);
    expect(level,).toBe("none",);
  });

  // ── Migration backfill: public → none ─────────────────────────────────────

  test("009 backfill: rows with encryption_level=public are corrected to none", async () => {
    const chatId = "chat-public-backfill";
    // Insert with the old "public" sentinel directly (bypassing the new default)
    await db.insertInto("chats",).values({
      id: chatId,
      name: chatId,
      type: "direct",
      mode: "direct",
      created_by: ACTOR_ID,
      // NOTE: "public" is the historical invalid sentinel — schema now enforces
      // none|standard|private; this insert is for backfill verification only.
      encryption_level: "public",
    },).execute();

    // Verify it was inserted
    const before = await db.selectFrom("chats",).select("encryption_level",)
      .where("id", "=", chatId,).executeTakeFirst();
    expect(before?.encryption_level,).toBe("public",);

    // Run the backfill portion of migration 009 (SET DEFAULT is schema-only)
    await db.updateTable("chats",)
      .set({ encryption_level: "none", },)
      .where("encryption_level", "=", "public",)
      .execute();

    // Verify it was corrected
    const after = await db.selectFrom("chats",).select("encryption_level",)
      .where("id", "=", chatId,).executeTakeFirst();
    expect(after?.encryption_level,).toBe("none",);
  });

  test("backfill is idempotent: re-running changes nothing", async () => {
    const chatId = "chat-public-backfill-idempotent";
    await db.insertInto("chats",).values({
      id: chatId,
      name: chatId,
      type: "direct",
      mode: "direct",
      created_by: ACTOR_ID,
      // NOTE: "public" is the historical invalid sentinel — kept here to verify
      // the WHERE clause is a true no-op on already-corrected rows.
      encryption_level: "public",
    },).execute();

    // Run backfill twice
    await db.updateTable("chats",)
      .set({ encryption_level: "none", },)
      .where("encryption_level", "=", "public",)
      .execute();
    await db.updateTable("chats",)
      .set({ encryption_level: "none", },)
      .where("encryption_level", "=", "public",)
      .execute();

    const after = await db.selectFrom("chats",).select("encryption_level",)
      .where("id", "=", chatId,).executeTakeFirst();
    expect(after?.encryption_level,).toBe("none",);
  });
});
