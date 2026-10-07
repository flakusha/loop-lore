// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, mock, test, } from "bun:test";
import { Kysely, } from "kysely";
import { mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import * as realConfigLoad from "../config/load";
import { isUsableEncryptionSecret, } from "../crypto/user-secret";
import { createSqliteDialect, } from "../db/index";
import { runMigrations, } from "../db/migrate";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertUsers, } from "../test-utils/insert-helpers";
import { describeOrSkip, } from "../test-utils/isolate-only";
import { main, runBackfill, } from "./backfill-users-encryption-secret";

let db: Kysely<DB>;
let sqlite: Database;
let keyedId: string;
let nullSecretId: string;
let emptySecretId: string;

const PRE_EXISTING = "c".repeat(64,);

beforeAll(async () => {
  ({ db, sqlite, } = await createTestDb());
  keyedId = await insertUsers(db, "bf-keyed", "Keyed", { encryption_secret: PRE_EXISTING, },);
  nullSecretId = await insertUsers(db, "bf-null", "Null", { encryption_secret: null, },);
  emptySecretId = await insertUsers(db, "bf-empty", "Empty", { encryption_secret: "", },);
},);

afterAll(async () => {
  await sqlite.close();
},);

/** Read the stored secret straight from the DB — no mock, no echo. */
async function secretOf(userId: string,): Promise<string | null> {
  const row = await db.selectFrom("users",).select("encryption_secret",).where("id", "=", userId,).executeTakeFirst();
  return row?.encryption_secret ?? null;
}

describe("runBackfill", () => {
  test("fills only the keyless users and leaves the keyed one untouched", async () => {
    const summary = await runBackfill(db, {},);
    expect(summary.missing,).toBe(2,);
    expect(summary.updated,).toBe(2,);
    expect(isUsableEncryptionSecret(await secretOf(nullSecretId,),),).toBe(true,);
    expect(isUsableEncryptionSecret(await secretOf(emptySecretId,),),).toBe(true,);
    expect(await secretOf(keyedId,),).toBe(PRE_EXISTING,);
  });

  test("second run is a no-op — it must not rotate a live key", async () => {
    const afterFirst = await secretOf(nullSecretId,);
    const summary = await runBackfill(db, {},);
    expect(summary.missing,).toBe(0,);
    expect(summary.updated,).toBe(0,);
    expect(await secretOf(nullSecretId,),).toBe(afterFirst,);
  });

  test("backfilled users get distinct secrets from each other", async () => {
    const [a, b,] = [await secretOf(nullSecretId,), await secretOf(emptySecretId,),];
    expect(a,).not.toBe(b,);
  });

  test("dry-run reports the work without writing", async () => {
    const freshId = await insertUsers(db, "bf-dry", "Dry", { encryption_secret: null, },);
    const summary = await runBackfill(db, { dryRun: true, },);
    expect(summary.missing,).toBe(1,);
    expect(summary.updated,).toBe(1,);
    expect(summary.dryRun,).toBe(true,);
    expect(await secretOf(freshId,),).toBeNull();
  });
});

// `main()` reads `loadConfig().db.sqliteFilename` and opens that file itself, so
// the only hermetic way to drive it is to swap that module for a fake config
// pointing at a throwaway on-disk DB. `mock.module` is process-global, hence the
// per-file-isolation gate (same approach as migrate-character-legacy.test.ts).
describeOrSkip("main() CLI entry", () => {
  const tmpDirs: string[] = [];
  const logs: string[] = [];
  const origLog = console.log;
  const origErr = console.error;

  /** Point `loadConfig()` at `sqliteFilename` for the duration of one test. */
  const useConfig = (sqliteFilename: string,): void => {
    mock.module("../config/load", () => ({
      ...realConfigLoad,
      loadConfig: () => ({ db: { type: "sqlite", sqliteFilename, }, }),
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

  /** Create a migrated on-disk DB holding one keyless user; return its path. */
  const seedOnDiskDb = async (id: string,): Promise<string> => {
    const dir = mkdtempSync(join(tmpdir(), "loop-lore-bf-",),);
    tmpDirs.push(dir,);
    const dbPath = join(dir, "bf.sqlite",);
    const seedSqlite = new Database(dbPath,);
    seedSqlite.run("PRAGMA foreign_keys = ON",);
    const seedDb = new Kysely<DB>({ dialect: createSqliteDialect(seedSqlite,), },);
    await runMigrations(seedDb,);
    await insertUsers(seedDb, id, id, { id, encryption_secret: null, },);
    await seedDb.destroy();
    seedSqlite.close();
    return dbPath;
  };

  /** Read one user's stored secret straight out of the on-disk DB. */
  const readSecret = async (dbPath: string, id: string,): Promise<string | null> => {
    const readSqlite = new Database(dbPath,);
    const readDb = new Kysely<DB>({ dialect: createSqliteDialect(readSqlite,), },);
    try {
      const row = await readDb
        .selectFrom("users",)
        .select("encryption_secret",)
        .where("id", "=", id,)
        .executeTakeFirst();

      return row?.encryption_secret ?? null;
    } finally {
      await readDb.destroy();
      readSqlite.close();
    }
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
    mock.module("../config/load", () => realConfigLoad,);
    for (const dir of tmpDirs) {
      rmSync(dir, { recursive: true, force: true, },);
    }
  },);

  test("rejects :memory: SQLite filename and returns 1", async () => {
    useConfig(":memory:",);
    expect(await main(),).toBe(1,);
  });

  test("rejects an empty SQLite filename and returns 1", async () => {
    useConfig("",);
    expect(await main(),).toBe(1,);
  });

  test("backfills a real on-disk DB, then re-runs as an idempotent no-op", async () => {
    const dbPath = await seedOnDiskDb("bf-cli",);
    useConfig(dbPath,);

    logs.length = 0;
    expect(await main(),).toBe(0,);
    expect(logs.some((line,) => line.includes("updated : 1",)),).toBe(true,);
    expect(isUsableEncryptionSecret(await readSecret(dbPath, "bf-cli",),),).toBe(true,);

    logs.length = 0;
    expect(await main(),).toBe(0,);
    expect(logs.some((line,) => line.includes("updated : 0",)),).toBe(true,);
  });

  test("--dry-run reports the work without writing", async () => {
    const dbPath = await seedOnDiskDb("bf-cli-dry",);
    useConfig(dbPath,);

    logs.length = 0;
    expect(await withArgv(["--dry-run",], () => main(),),).toBe(0,);
    expect(logs.some((line,) => line.includes("would update : 1",)),).toBe(true,);
    expect(await readSecret(dbPath, "bf-cli-dry",),).toBeNull();
  });
},);
