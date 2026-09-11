/**
 * AC5 — concurrent join + leave collapses to a single re-encrypt event.
 *
 * Fires two concurrent `rotateKeyOnLeave` calls for distinct departing
 * members of the same chat. Expected: the rotation coalesces — exactly
 * ONE re-encrypt event is observed (`getRotationEventCount() === 1`)
 * and both callers receive the same ChatKey.
 *
 * Source instrumentation (justified): the original `rotateKeyOnLeave`
 * did not coalesce concurrent calls. Two callers fired in the same tick
 * each generate a new random key, each re-encrypt the chat history,
 * each UPDATE `chat_keys` — last writer wins, both events count, and
 * history re-encrypts twice. The minimum surface area to make AC5 +
 * AC6 deterministic is:
 *   - per-chat in-flight lock map (collapse concurrent rotations)
 *   - a counter incremented only when the rotation body actually runs
 *   - a `awaitChatKeyLock(chatId)` reader-side hook so send-paths
 *     block on the same lock and observe the post-rotation key
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
import { getChatKeyById, } from "./chat-keys";
import {
  getChatKey,
  getRotationEventCount,
  resetRotationEventCount,
  rotateKeyOnLeave,
} from "./key-distribution";
import { compressThenEncrypt, decryptThenDecompress, } from "./pipeline";
import { getSmk, initSmk, } from "./smk";

const VALID_HEX_KEY = "b".repeat(64,);
const USER_A = "user-concurrent-a";
const USER_B = "user-concurrent-b";
const USER_C = "user-concurrent-c";
const USER_D = "user-concurrent-d";
const CHAT_ID = "chat-concurrent-rotation";

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
        const mod = await import(path.join(dir, fileName,));
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
    type: "group",
    mode: "group",
    created_by: USER_A,
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

describe("AC5: concurrent join+leave collapses to a single rotation", () => {
  test("two concurrent rotateKeyOnLeave for different leavers → 1 rotation event", async () => {
    resetRotationEventCount();

    await insertActor(USER_A, "user",);
    await insertActor(USER_B, "user",);
    await insertActor(USER_C, "user",);
    await insertActor(USER_D, "user",);
    await insertChat(CHAT_ID, "standard",);
    for (const u of [USER_A, USER_B, USER_C, USER_D,]) {
      await addParticipant(CHAT_ID, u,);
    }

    const smk = getSmk()!;
    for (const u of [USER_A, USER_B, USER_C, USER_D,]) {
      await generateActorKey({ database: db, actorId: u, smk, name: "primary", },);
    }

    // Plant an encrypted message so the post-rotation key can be
    // verified to be the one stored on the row (and decryption works).
    const initialKey = await getChatKey(db, CHAT_ID,);
    const initialCiphertext = await compressThenEncrypt({
      plaintext: "hello before rotation",
      chatKey: initialKey.key,
      keyId: initialKey.keyId,
    },);
    await db.insertInto("messages",).values({
      id: crypto.randomUUID(),
      chat_id: CHAT_ID,
      actor_id: USER_A,
      role: "user",
      content: initialCiphertext,
      content_encoding: "identity",
      key_id: initialKey.keyId,
      status: "confirmed",
      visibility: "visible",
    },).execute();

    const beforeKeyId = (await getChatKey(db, CHAT_ID,)).keyId;
    expect(getRotationEventCount(),).toBe(0,);

    // Two concurrent rotateKeyOnLeave calls for DIFFERENT leavers. The
    // join path (distributeKeysOnJoin) does NOT rotate, so AC5 is
    // really about coalescing concurrent leaves. The test asserts:
    //   (a) getRotationEventCount() === 1 — the rotation body ran once.
    //   (b) both calls resolve to the SAME ChatKey — coalesced work.
    //   (c) chat_keys row id matches the coalesced result — last
    //       writer did not overwrite with a stale key.
    const [resultA, resultB,] = await Promise.all([
      rotateKeyOnLeave(db, CHAT_ID, USER_C,),
      rotateKeyOnLeave(db, CHAT_ID, USER_D,),
    ],);

    expect(getRotationEventCount(),).toBe(1,);
    expect(resultA.keyId,).toBe(resultB.keyId,);
    expect(resultA.keyId,).not.toBe(beforeKeyId,);

    const row = await db.selectFrom("chat_keys",).select("id",)
      .where("chat_id", "=", CHAT_ID,).executeTakeFirstOrThrow();
    expect(row.id,).toBe(resultA.keyId,);

    const msgs = await db.selectFrom("messages",).select(["content", "key_id",],)
      .where("chat_id", "=", CHAT_ID,).execute();
    expect(msgs.length,).toBe(1,);
    expect(msgs[0]!.key_id,).toBe(resultA.keyId,);
    const postKey = await getChatKeyById(db, resultA.keyId, smk,);
    expect(postKey,).not.toBeNull();
    const plaintext = await decryptThenDecompress(msgs[0]!.content, postKey!.key,);
    expect(plaintext,).toBe("hello before rotation",);
  });
});
