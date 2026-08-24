/**
 * Tests for routes/message-encryption.ts — chat key endpoint
 *
 * Covers tier-gate behaviour (Phase D E2E followup):
 *   - `at-rest` chats reject with 404 (server must not derive a key)
 *   - `none` chats reject with 404 (no key needed)
 *   - `standard` chats still resolve through deriveChatKeyForChat
 */

import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { Kysely, sql, } from "kysely";
import { type Migration, Migrator, } from "kysely/migration";
import { readdirSync, } from "node:fs";
import path from "node:path";

import { initSmk, } from "../crypto/smk";
import { createSqliteDialect, } from "../db";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { messageEncryptionRoutes, } from "./message-encryption";

const VALID_HEX_KEY = "c".repeat(64,);
const USER_ID = "msg-enc-user-001";

let db: Kysely<DB>;
let app: Elysia;

function buildMigrationProvider(): { getMigrations: () => Promise<Record<string, Migration>> } {
  return {
    async getMigrations(): Promise<Record<string, Migration>> {
      const dir = path.join(__dirname, "..", "db", "migrations",);
      const files = readdirSync(dir,)
        .filter((f,) => f.endsWith(".ts",))
        .toSorted((a, b,) => a.localeCompare(b,));
      const migrations: Record<string, Migration> = {};
      for (const f of files) {
        // The migration specifier IS genuinely runtime-selected (readdirSync
        // of src/db/migrations/); a static import would require hardcoding
        // every filename. The only writable alternative would be a generated
        // barrel, which the project deliberately avoids.
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
    compressThreshold: 128,
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
  app = new Elysia({ name: "test-msg-encryption", },)
    .derive(() => ({ userId: USER_ID, userRole: "solo", }))
    .use(
      messageEncryptionRoutes({
        database: db,
        config: {} as Parameters<typeof messageEncryptionRoutes>[0]["config"],
      },),
    ) as unknown as Elysia;
},);

afterAll(async () => {
  // Reset SMK to prevent pollution of other test suites
  await initSmk({ required: false, compressThreshold: 128, compressAlgorithm: "gzip", },);
  await db.destroy();
},);

beforeEach(async () => {
  await sql`DELETE FROM chats`.execute(db,);
  await sql`DELETE FROM chat_keys`.execute(db,);
},);

async function insertChat(chatId: string, level: "none" | "standard" | "at-rest",): Promise<void> {
  await db.insertInto("chats",).values({
    id: chatId,
    name: chatId,
    type: "direct",
    mode: "direct",
    created_by: USER_ID,
    encryption_level: level,
  },).execute();
}

async function callKeyEndpoint(chatId: string,): Promise<Response> {
  return app.handle(
    new Request(`http://localhost/api/chats/${chatId}/encryption-key`, {
      method: "GET",
    },),
  );
}

describe("message-encryption route", () => {
  test("module exports expected functions", () => {
    expect(typeof messageEncryptionRoutes,).toBe("function",);
  });
});

describe("GET /api/chats/:id/encryption-key — tier gate", () => {
  test("at-rest chat: returns 404 and does not create a chat_keys row", async () => {
    await insertChat("chat-at-rest-001", "at-rest",);
    const res = await callKeyEndpoint("chat-at-rest-001",);
    expect(res.status,).toBe(404,);
    const keyRow = await db
      .selectFrom("chat_keys",)
      .selectAll()
      .where("chat_id", "=", "chat-at-rest-001",)
      .executeTakeFirst();
    expect(keyRow,).toBeUndefined();
  });

  test("none chat: returns 404", async () => {
    await insertChat("chat-none-001", "none",);
    const res = await callKeyEndpoint("chat-none-001",);
    expect(res.status,).toBe(404,);
  });

  test("standard chat: returns 200 with rawKey when encryption is enabled", async () => {
    await insertChat("chat-standard-001", "standard",);
    const res = await callKeyEndpoint("chat-standard-001",);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { rawKey?: string; algorithm?: string };
    expect(body.algorithm,).toBe("AES-GCM",);
    expect(typeof body.rawKey,).toBe("string",);
    expect(body.rawKey,).toMatch(/^[A-Za-z0-9+/]+=*$/,);
  });
});
