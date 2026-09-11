// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for crypto/e2e/e2e-session.ts — group-session branches +
 * insert-race recovery in ensureActiveSession.
 *
 * Complements e2e-session.integration.test.ts (pair path): deterministic
 * actor/chat ids, no randomness in assertions.
 */

import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";
import type { Migration, } from "kysely/migration";
import { Migrator, } from "kysely/migration";
import { readdirSync, } from "node:fs";
import path from "node:path";

import { createSqliteDialect, } from "../../db";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { ensureActiveSession, findSession, revokeSession, } from "./e2e-session";

const OWNER = "cov-sess-owner";
const ALICE = "cov-sess-alice";
const CAROL = "cov-sess-carol";
const DAVE = "cov-sess-dave";
const EVE = "cov-sess-eve";
const FRANK = "cov-sess-frank";
const GRACE = "cov-sess-grace";
const HEIDI = "cov-sess-heidi";
const GROUP_CHAT = "cov-sess-group-chat";
const GROUP_CHAT_2 = "cov-sess-group-chat-2";

/** */
function buildMigrationProvider() {
  return {
    async getMigrations(): Promise<Record<string, Migration>> {
      const migrationDir = path.join(__dirname, "..", "..", "db", "migrations",);
      const migrationFiles = readdirSync(migrationDir,)
        .filter((f,) => f.endsWith(".ts",))
        .toSorted((a, b,) => a.localeCompare(b,));
      const migrations: Record<string, Migration> = {};
      for (const f of migrationFiles) {
        const mod = (await import(path.join(migrationDir, f,))) as
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

/**
 * @param db
 * @param userId
 */
async function seedUser(db: Kysely<DB>, userId: string,): Promise<void> {
  await db.insertInto("users",).values({
    id: userId,
    username: userId,
    display_name: userId,
    password_hash: "dummy",
  },).execute();
}

/**
 * @param db
 * @param actorId
 */
async function seedActor(db: Kysely<DB>, actorId: string,): Promise<void> {
  const userId = `${actorId}-user`;
  await seedUser(db, userId,);
  await db.insertInto("actors",).values({
    id: actorId,
    actor_type: "user",
    display_name: actorId,
    user_id: userId,
    owner_id: userId,
    agent_type: "none",
    settings: "{}",
    import_spec: "raw",
    data_source_format: "json",
    data_raw: null,
    format_version: 0,
    visibility: "private",
  },).execute();
}

let db: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "warn", },);
  const sqlite = new Database(":memory:",);
  sqlite.run("PRAGMA foreign_keys = OFF",);
  db = new Kysely<DB>({ dialect: createSqliteDialect(sqlite,), },);
  const migrator = new Migrator({ db, provider: buildMigrationProvider(), },);
  const { error, } = await migrator.migrateToLatest();
  if (error) { throw new Error(`Migration failed: ${JSON.stringify(error,)}`,); }
  await seedUser(db, OWNER,);
  for (const actor of [ALICE, CAROL, DAVE, EVE, FRANK, GRACE, HEIDI,]) {
    await seedActor(db, actor,);
  }
  for (const chatId of [GROUP_CHAT, GROUP_CHAT_2,]) {
    await db.insertInto("chats",).values({
      id: chatId,
      created_by: OWNER,
      name: chatId,
      type: "direct" as never,
    },).execute();
  }
},);

afterAll(async () => {
  await db.destroy();
},);

/**
 * Wrap the db so the next insertInto().values().execute() chain plants a
 * rival row via the real db, then throws a constraint error — simulating a
 * lost insert race. Reads pass through untouched.
 * @param plant
 */
function raceDb(plant: () => Promise<void>,): Kysely<DB> {
  let armed = true;
  return new Proxy(db, {
    get(target, prop, receiver,) {
      if (prop === "insertInto" && armed) {
        armed = false;
        return () => ({
          values: () => ({
            execute: async () => {
              await plant();
              throw new Error("UNIQUE constraint failed: idx_e2e_sessions_pair",);
            },
          }),
        });
      }
      const value = Reflect.get(target, prop, receiver,);
      return typeof value === "function" ? value.bind(target,) : value;
    },
  },) as unknown as Kysely<DB>;
}

describe("e2e-session group branches", () => {
  test("ensureActiveSession kind group creates a chat-anchored row and is idempotent", async () => {
    const a = await ensureActiveSession({
      database: db,
      senderActorId: ALICE,
      recipientActorId: ALICE,
      chatId: GROUP_CHAT,
      kind: "group",
    },);
    expect(a.kind,).toBe("group",);
    expect(a.chatId,).toBe(GROUP_CHAT,);
    expect(a.recipientActorId,).toBeNull();
    expect(a.revokedAt,).toBeNull();

    const b = await ensureActiveSession({
      database: db,
      senderActorId: ALICE,
      recipientActorId: ALICE,
      chatId: GROUP_CHAT,
      kind: "group",
    },);
    expect(b.id,).toBe(a.id,);

    const reread = await findSession({ database: db, sessionId: a.id, },);
    expect(reread?.kind,).toBe("group",);
    expect(reread?.chatId,).toBe(GROUP_CHAT,);
  });

  test("revoked group session is hidden from lookup; ensure creates a fresh row", async () => {
    const first = await ensureActiveSession({
      database: db,
      senderActorId: EVE,
      recipientActorId: EVE,
      chatId: GROUP_CHAT_2,
      kind: "group",
    },);
    expect(await revokeSession({ database: db, sessionId: first.id, },),).toBe(true,);
    const second = await ensureActiveSession({
      database: db,
      senderActorId: EVE,
      recipientActorId: EVE,
      chatId: GROUP_CHAT_2,
      kind: "group",
    },);
    expect(second.id,).not.toBe(first.id,);
    expect(second.revokedAt,).toBeNull();
  });

  test("group session without chatId creates a row with null chat anchor", async () => {
    const row = await ensureActiveSession({
      database: db,
      senderActorId: FRANK,
      recipientActorId: FRANK,
      kind: "group",
    },);
    expect(row.kind,).toBe("group",);
    expect(row.chatId,).toBeNull();
  });
});

describe("e2e-session insert-race recovery", () => {
  test("pair race: failed insert re-reads the rival row", async () => {
    const raced = await ensureActiveSession({
      database: raceDb(async () => {
        await db.insertInto("e2e_sessions",).values({
          id: "cov-race-pair-rival",
          sender_actor_id: CAROL,
          recipient_actor_id: DAVE,
          kind: "pair",
        },).execute();
      },),
      senderActorId: CAROL,
      recipientActorId: DAVE,
    },);
    expect(raced.id,).toBe("cov-race-pair-rival",);
    expect(raced.senderActorId,).toBe(CAROL,);
  });

  test("group race: failed insert re-reads the rival group row", async () => {
    const raced = await ensureActiveSession({
      database: raceDb(async () => {
        await db.insertInto("e2e_sessions",).values({
          id: "cov-race-group-rival",
          sender_actor_id: GRACE,
          chat_id: GROUP_CHAT,
          kind: "group",
        },).execute();
      },),
      senderActorId: GRACE,
      recipientActorId: GRACE,
      chatId: GROUP_CHAT,
      kind: "group",
    },);
    expect(raced.id,).toBe("cov-race-group-rival",);
    expect(raced.chatId,).toBe(GROUP_CHAT,);
  });

  test("failed insert with no rival rethrows the original error", async () => {
    await expect(
      ensureActiveSession({
        database: raceDb(async () => {/* plant nothing */},),
        senderActorId: HEIDI,
        recipientActorId: HEIDI,
      },),
    ).rejects.toThrow("UNIQUE constraint failed",);
  });
});
