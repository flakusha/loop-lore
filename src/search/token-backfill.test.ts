import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, mock, test, } from "bun:test";
import { Kysely, sql, } from "kysely";
import { mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import * as realConfigLoad from "../config/load";
import { encryptMessageContent, generateActorKey, getSmk, } from "../crypto";
import { initSmk, } from "../crypto/smk";
import { MessageRole, } from "../db/enums";
import { createSqliteDialect, } from "../db/index";
import { runMigrations, } from "../db/migrate";
import type { DB, } from "../db/schema";
import { main, } from "../scripts/backfill-message-tokens";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertChats, insertMessages, insertUsers, } from "../test-utils/insert-helpers";
import { describeOrSkip, } from "../test-utils/isolate-only";
import { uid, } from "../utils";
import { deriveSearchTokens, } from "./encrypted-tokens";
import { backfillMessageTokens, } from "./token-backfill";
import { matchMessageIdsByTokens, } from "./token-store";

const SMK_HEX = "b".repeat(64,);
/** Valid 64-char hex secret — `isUsableEncryptionSecret` rejects anything else. */
const USER_KEY = "c".repeat(64,);
const PLAINTEXT = "dragons gather at moonlit tavern";

let db: Kysely<DB>;
let sqlite: Database;
let userId: string;
let stdChatId: string;
let encMsgId: string;

beforeAll(async () => {
  ({ db, sqlite, } = await createTestDb());
  await initSmk({
    serverEncryptionKey: SMK_HEX,
    required: false,
    compressThreshold: 1024,
    compressAlgorithm: "gzip",
  },);

  userId = uid();
  const actorId = uid();
  await insertUsers(db, "backfill-tester", "Tester", {
    id: userId,
    encryption_secret: USER_KEY,
  } as never,);

  await insertActors(db, "Tester", { id: actorId, user_id: userId, } as never,);
  stdChatId = await insertChats(db, "Backfill chat", userId, {
    id: uid(),
    encryption_level: "standard",
  },);

  const smk = getSmk();
  if (!smk) { throw new Error("SMK not loaded — test setup failed",); }
  await generateActorKey({ database: db, actorId, smk, name: "primary", },);

  // The one row the backfill must index: server-encrypted, no plaintext mirror.
  const enc = await encryptMessageContent({
    database: db,
    chatId: stdChatId,
    actorId,
    plaintext: PLAINTEXT,
    smk,
  },);

  encMsgId = uid();
  await insertMessages(db, stdChatId, actorId, MessageRole.User, enc.storedContent, {
    id: encMsgId,
    key_id: enc.keyId,
    content_plaintext: null,
  },);

  // FTS-covered row (mirror present): key_id set, but NOT a candidate.
  await insertMessages(db, stdChatId, actorId, MessageRole.User, "mirror-blob", {
    id: uid(),
    key_id: "k-mirror",
    content_plaintext: "mirror text",
  },);

  // Undecryptable candidate: envelope-shaped with a key id no chat_keys row
  // satisfies. (Plain garbage would decrypt as plaintext passthrough —
  // `decryptAtRest` only throws for envelopes whose key cannot resolve.)
  await insertMessages(
    db,
    stdChatId,
    actorId,
    MessageRole.User,
    JSON.stringify({
      enc: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      nonce: "AAAAAAAAAAAAAAAA",
      algo: "aes-256-gcm",
      comp: false,
      key_id: crypto.randomUUID(),
    },),
    {
      id: uid(),
      key_id: "k-gone",
      content_plaintext: null,
    },
  );

  // Level-none candidate: skipped (its content is plaintext, FTS-covered).
  const noneChatId = await insertChats(db, "Backfill none chat", userId, {
    id: uid(),
    encryption_level: "none",
  },);

  await insertMessages(db, noneChatId, actorId, MessageRole.User, "plain text", {
    id: uid(),
    key_id: "k-none",
    content_plaintext: null,
  },);

  // Unkeyed-owner candidate: skipped (no users.encryption_secret to blind with).
  const unkeyedUserId = uid();
  await insertUsers(db, "backfill-unkeyed", "Unkeyed", {
    id: unkeyedUserId,
    encryption_secret: null,
  } as never,);

  const unkeyedChatId = await insertChats(db, "Backfill unkeyed chat", unkeyedUserId, {
    id: uid(),
    encryption_level: "standard",
  },);

  await insertMessages(db, unkeyedChatId, actorId, MessageRole.User, "sealed-blob", {
    id: uid(),
    key_id: "k-unkeyed",
    content_plaintext: null,
  },);
},);

afterAll(async () => {
  // Disarm SMK so the global never leaks into other suites.
  await initSmk({ required: false, compressThreshold: 1024, compressAlgorithm: "gzip", },);
  await db.destroy();
  sqlite.close();
},);

async function tokenTerms(): Promise<string[]> {
  const rows = await db
    .selectFrom("message_search_tokens",)
    .select("term",)
    .where("message_id", "=", encMsgId,)
    .execute();

  return rows.map((row,) => row.term);
}

describe("search/token-backfill", () => {
  // Runs with no ENABLE_TOKEN_INDEXING set: the script's opt-in IS its
  // invocation, unlike the live write path.
  test("indexes the decryptable encrypted row and skips the rest", async () => {
    const summary = await backfillMessageTokens(db,);
    // Candidates: the encrypted row, the undecryptable garbage row, the
    // level-none row, and the unkeyed-owner row. The mirror row is excluded
    // by the candidate query itself.
    expect(summary.candidates,).toBe(4,);
    expect(summary.indexed,).toBe(1,);
    expect(summary.skipped,).toBe(2,);
    expect(summary.undecryptable,).toBe(1,);
    expect(summary.cursor,).toBeGreaterThan(0,);

    // PLAINTEXT words ≥3 chars: dragons, gather, moonlit, tavern.
    const terms = await tokenTerms();
    expect(terms,).toHaveLength(4,);

    // Tokens blinded with the owner's key are findable by the token tier.
    const query = await deriveSearchTokens("moonlit tavern", USER_KEY,);
    const matches = await matchMessageIdsByTokens(db, query, userId,);
    expect(matches.map((m,) => m.messageId),).toContain(encMsgId,);
  });

  test("is idempotent on re-run", async () => {
    const before = await tokenTerms();
    const summary = await backfillMessageTokens(db,);
    expect(summary.indexed,).toBe(1,);
    expect(await tokenTerms(),).toEqual(before,);
  });

  test("dry-run reports without writing", async () => {
    await db.deleteFrom("message_search_tokens",).where("message_id", "=", encMsgId,).execute();
    const summary = await backfillMessageTokens(db, { dryRun: true, },);
    expect(summary.dryRun,).toBe(true,);
    expect(summary.indexed,).toBe(1,);
    expect(await tokenTerms(),).toEqual([],);
  });

  test("resume cursor bounds the scan", async () => {
    const encRow = await db
      .selectFrom("messages",)
      .select(sql<number>`rowid`.as("rowid",),)
      .where("id", "=", encMsgId,)
      .executeTakeFirst() as { rowid: number };

    const summary = await backfillMessageTokens(db, { afterRowid: encRow.rowid, },);
    expect(summary.candidates,).toBeGreaterThan(0,);
    expect(summary.indexed,).toBe(0,);
  });
});

// `main()` reads `loadConfig().db.sqliteFilename` + `encryption.serverEncryptionKey`
// and opens the file itself, so the only hermetic way to drive it is to swap
// that module for a fake config pointing at a throwaway on-disk DB.
// `mock.module` is process-global, hence the per-file-isolation gate (same
// approach as backfill-users-encryption-secret.test.ts).
describeOrSkip("backfill-message-tokens main() CLI entry", () => {
  const tmpDirs: string[] = [];
  const logs: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  const REAL_CONFIG_LOAD = { ...realConfigLoad, };

  /** Point `loadConfig()` at the given db file and server key for one test. */
  const useConfig = (sqliteFilename: string, serverEncryptionKey: string,): void => {
    mock.module("../config/load", () => ({
      ...REAL_CONFIG_LOAD,
      loadConfig: () => ({
        db: { type: "sqlite", sqliteFilename, },
        encryption: {
          serverEncryptionKey,
          required: false,
          compressThreshold: 1024,
          compressAlgorithm: "gzip",
        },
      }),
    }),);
  };

  /** Run `fn` with `process.argv[2..]` replaced by `args`, restored after. */
  const withArgv = async (args: string[], fn: () => Promise<number>,): Promise<number> => {
    const saved = process.argv.slice(2,);
    process.argv.length = 2;
    process.argv.push(...args,);
    try {
      return await fn();
    } finally {
      process.argv.length = 2;
      process.argv.push(...saved,);
    }
  };

  /** Migrated on-disk DB holding one keyed user + one server-encrypted message. */
  const seedOnDiskDb = async (id: string,): Promise<string> => {
    const dir = mkdtempSync(join(tmpdir(), "loop-lore-bf-msg-",),);
    tmpDirs.push(dir,);
    const dbPath = join(dir, "bf-msg.sqlite",);
    const seedSqlite = new Database(dbPath,);
    seedSqlite.run("PRAGMA foreign_keys = ON",);
    const seedDb = new Kysely<DB>({ dialect: createSqliteDialect(seedSqlite,), },);
    await runMigrations(seedDb,);

    const ownerId = uid();
    const actorId = uid();
    await insertUsers(seedDb, id, id, { id: ownerId, encryption_secret: USER_KEY, } as never,);
    await insertActors(seedDb, "Seeded", { id: actorId, user_id: ownerId, } as never,);
    const chatId = await insertChats(seedDb, "CLI chat", ownerId, {
      id: uid(),
      encryption_level: "standard",
    },);

    const smk = getSmk();
    if (!smk) { throw new Error("SMK not loaded — test setup failed",); }
    await generateActorKey({ database: seedDb, actorId, smk, name: "primary", },);
    const enc = await encryptMessageContent({
      database: seedDb,
      chatId,
      actorId,
      plaintext: PLAINTEXT,
      smk,
    },);

    await insertMessages(seedDb, chatId, actorId, MessageRole.User, enc.storedContent, {
      id: uid(),
      key_id: enc.keyId,
      content_plaintext: null,
    },);

    await seedDb.destroy();
    seedSqlite.close();
    return dbPath;
  };

  beforeAll(() => {
    console.log = (...args: unknown[]) => {
      logs.push(args.join(" ",),);
    };

    console.error = () => {};
  },);

  afterAll(() => {
    console.log = origLog;
    console.error = origErr;
    mock.module("../config/load", () => ({ ...REAL_CONFIG_LOAD, }),);
    for (const dir of tmpDirs) {
      rmSync(dir, { recursive: true, force: true, },);
    }
  },);

  test("rejects :memory: SQLite filename and returns 1", async () => {
    useConfig(":memory:", SMK_HEX,);
    expect(await main(),).toBe(1,);
  });

  test("rejects a missing serverEncryptionKey and returns 1", async () => {
    useConfig(":memory:", "",);
    expect(await main(),).toBe(1,);
  });

  test("indexes a real on-disk DB, then re-runs as an idempotent no-op", async () => {
    const dbPath = await seedOnDiskDb("bf-msg-cli",);
    useConfig(dbPath, SMK_HEX,);

    logs.length = 0;
    expect(await main(),).toBe(0,);
    expect(logs.some((line,) => line.includes("indexed     : 1",)),).toBe(true,);

    logs.length = 0;
    expect(await main(),).toBe(0,);
    // The candidate row does not disappear: re-runs re-derive the SAME tokens
    // (replace-per-message writes), so the count stays 1.
    expect(logs.some((line,) => line.includes("indexed     : 1",)),).toBe(true,);
  });

  test("--dry-run reports the work without writing", async () => {
    const dbPath = await seedOnDiskDb("bf-msg-cli-dry",);
    useConfig(dbPath, SMK_HEX,);

    logs.length = 0;
    expect(await withArgv(["--dry-run",], () => main(),),).toBe(0,);
    expect(logs.some((line,) => line.includes("would index     : 1",)),).toBe(true,);

    const readSqlite = new Database(dbPath,);
    const readDb = new Kysely<DB>({ dialect: createSqliteDialect(readSqlite,), },);
    try {
      const rows = await readDb.selectFrom("message_search_tokens",).select("term",).execute();
      expect(rows,).toEqual([],);
    } finally {
      await readDb.destroy();
      readSqlite.close();
    }
  });
},);
