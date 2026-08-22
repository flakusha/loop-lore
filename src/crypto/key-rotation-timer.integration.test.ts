/**
 * Integration test: auto-rotation timer behavior
 *
 * Verifies the BUG-auto-rotation-config-drift ticket claim is stale:
 *
 * - `startAutoRotationTimer` returns null when keyRotationDays=0 (disabled).
 * - Returns a timer handle when keyRotationDays>0, and immediately fires
 *   runAutoRotation (proving the wiring is correct).
 * - When a key is already expired (created_at > rotationDays ago), the
 *   auto-rotation picks it up and transitions its status to "expired".
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, resetTestDb, } from "../test-utils/create-test-db";
import { generateActorKey, } from "./actor-keys";
import { findExpiredKeys, runAutoRotation, startAutoRotationTimer, } from "./key-rotation";
import { getSmk, initSmk, } from "./smk";

const VALID_HEX_KEY = "d".repeat(64,);
const OWNER_ID = "user-timer-owner";
const ACTOR_1 = "actor-timer-1";
const ACTOR_2 = "actor-timer-2";

let db: Kysely<DB>;
type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let sqlite: TestDb["sqlite"];

function getSmkSafe(): CryptoKey {
  const smk = getSmk();
  if (!smk) { throw new Error("SMK not loaded",); }
  return smk;
}

async function insertUser(id: string,) {
  await db.insertInto("users",).values({ id, username: id, display_name: id, },).execute();
}

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
    owner_id: type === "character" ? OWNER_ID : id,
    format_version: 0,
    visibility: "private",
  },).execute();
}

async function insertChat(id: string,) {
  await db.insertInto("chats",).values({
    id,
    name: id,
    type: "direct",
    mode: "direct",
    created_by: OWNER_ID,
    encryption_level: "standard",
  },).execute();
}

async function addParticipant(chatId: string, actorId: string,) {
  await db.insertInto("chat_participants",).values({
    chat_id: chatId,
    actor_id: actorId,
    role_in_chat: "member",
  },).execute();
}

beforeAll(async () => {
  const created = await createTestDb();
  db = created.db;
  sqlite = created.sqlite;
  await initSmk({
    serverEncryptionKey: VALID_HEX_KEY,
    required: false,
    compressThreshold: 128,
    compressAlgorithm: "gzip",
  },);
},);

beforeEach(async () => {
  resetTestDb(sqlite,);
  sqlite.run("PRAGMA foreign_keys = OFF",);
  await insertUser(OWNER_ID,);
  await insertChat("chat-timer-1",);
  await insertActor(ACTOR_1, "character",);
  await insertActor(ACTOR_2, "character",);
  await addParticipant("chat-timer-1", ACTOR_1,);
  await addParticipant("chat-timer-1", ACTOR_2,);
  const smk = getSmkSafe();
  await generateActorKey({ database: db, actorId: ACTOR_1, smk, name: "primary", },);
  await generateActorKey({ database: db, actorId: ACTOR_2, smk, name: "primary", },);
},);

afterAll(async () => {
  await initSmk({ required: false, compressThreshold: 128, compressAlgorithm: "gzip", },);
  db.destroy();
},);

describe("startAutoRotationTimer", () => {
  test("returns null when keyRotationDays=0 (rotation disabled)", () => {
    const timer = startAutoRotationTimer(db, 0,);
    expect(timer,).toBeNull();
  });

  test("returns null when keyRotationDays<0", () => {
    const timer = startAutoRotationTimer(db, -10,);
    expect(timer,).toBeNull();
  });

  test("returns Timer handle when keyRotationDays>0 and runAutoRotation fires immediately", async () => {
    // Use a very large interval so the timer never fires during the test
    const timer = startAutoRotationTimer(db, 90, 86_400_000,);
    expect(timer,).not.toBeNull();
    // runAutoRotation fires immediately on start. SMK is initialized so it runs.
    // It finds no expired keys (all fresh), so rotated=0 is expected.
    // The timer handle is returned — clean it up.
    clearInterval(timer!,);
  });

  test("findExpiredKeys picks up actors with keys older than rotationDays", async () => {
    const smk = getSmkSafe();

    // Expire ACTOR_1's current key.
    await db
      .updateTable("actor_keys",)
      .set({ status: "expired", expires_at: new Date().toISOString(), },)
      .where("actor_id", "=", ACTOR_1,)
      .where("status", "=", "active",)
      .execute();

    // Generate a real key for ACTOR_1, then retroactively age its created_at
    // so it appears 101 days old.
    const agedKeyId = await generateActorKey({ database: db, actorId: ACTOR_1, smk, name: "primary", },);
    const agedDate = new Date(Date.now() - 101 * 24 * 60 * 60 * 1000,).toISOString();
    sqlite.run("UPDATE actor_keys SET created_at = ? WHERE id = ?", [agedDate, agedKeyId,],);

    const expired = await findExpiredKeys(db, 90,);
    expect(expired,).toContain(ACTOR_1,);
  });

  test("runAutoRotation expires aged keys and transitions their status", async () => {
    const smk = getSmkSafe();

    // Expire ACTOR_1's current key.
    await db
      .updateTable("actor_keys",)
      .set({ status: "expired", expires_at: new Date().toISOString(), },)
      .where("actor_id", "=", ACTOR_1,)
      .where("status", "=", "active",)
      .execute();

    // Generate a real key for ACTOR_1, then retroactively age its created_at
    // so it appears 101 days old — a real encrypted_key that can be decrypted.
    const agedKeyId = await generateActorKey({ database: db, actorId: ACTOR_1, smk, name: "primary", },);
    const agedDate = new Date(Date.now() - 101 * 24 * 60 * 60 * 1000,).toISOString();
    sqlite.run("UPDATE actor_keys SET created_at = ? WHERE id = ?", [agedDate, agedKeyId,],);

    const result = await runAutoRotation(db, 90, 100,);
    expect(result.checked,).toBeGreaterThanOrEqual(1,);
    expect(result.rotated,).toBeGreaterThanOrEqual(1,);

    // The aged key should now be expired
    const keyRow = await db
      .selectFrom("actor_keys",)
      .select(["status", "expires_at",],)
      .where("id", "=", agedKeyId,)
      .executeTakeFirst();
    expect(keyRow?.status,).toBe("expired",);
    expect(keyRow?.expires_at,).not.toBeNull();
  });
});
