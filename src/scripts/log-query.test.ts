// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Database, } from "bun:sqlite";
import type { Database as SqliteDatabase, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, mock, test, } from "bun:test";
import { Kysely, } from "kysely";
import { mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { createSqliteDialect, } from "../db/index";
import { runMigrations, } from "../db/migrate";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { ISOLATED, } from "../test-utils/isolate-only";
import {
  clampLimit,
  DEFAULT_LIMIT,
  formatTable,
  LIKE_MAX,
  LIMIT_CAP,
  main,
  normalizeTimestamp,
  parseEntitySelector,
  queryLogEntries,
} from "./log-query";

const describeIsolated = ISOLATED ? describe : describe.skip;

let db: Kysely<DB>;
let sqlite: SqliteDatabase;

/** Insert one audit row with a fully known shape. */
const seed = async (
  row: {
    id: string;
    level: number;
    createdAt: string;
    eventType?: string;
    entityType?: string;
    entityId?: string;
    userId?: string;
    message: string;
  },
): Promise<void> => {
  await db.insertInto("log_entries",)
    .values({
      id: row.id,
      level: row.level,
      timestamp: 1_700_000_000_000,
      time: row.createdAt,
      message: row.message,
      module: "test",
      user_id: row.userId ?? null,
      session_id: null,
      request_id: null,
      meta: null,
      event_type: row.eventType ?? null,
      entity_type: row.entityType ?? null,
      entity_id: row.entityId ?? null,
      action: null,
      created_at: row.createdAt,
    },)
    .execute();
};

beforeAll(async () => {
  ({ db, sqlite, } = await createTestDb());

  await seed({
    id: "l1",
    level: 40,
    createdAt: "2026-01-10 00:00:00",
    eventType: "moderation.chat.ban",
    entityType: "chat",
    entityId: "c-1",
    userId: "u-1",
    message: "banned from chat",
  },);

  await seed({
    id: "l2",
    level: 20,
    createdAt: "2026-01-11 00:00:00",
    eventType: "chat_ownership_transferred",
    entityType: "chat",
    entityId: "c-2",
    userId: "u-2",
    message: "ownership moved",
  },);

  await seed({
    id: "l3",
    level: 10,
    createdAt: "2026-01-12 00:00:00",
    eventType: "nsfw.gate.block",
    entityType: "chat",
    entityId: "c-1",
    userId: "u-1",
    message: "gate blocked the prompt",
  },);

  await seed({
    id: "l4",
    level: 50,
    createdAt: "2026-01-13 00:00:00",
    eventType: "nsfw.gate.allow",
    entityType: "world",
    entityId: "w-1",
    userId: "u-2",
    message: "gate allowed the prompt",
  },);
},);

afterAll(async () => {
  await sqlite.close();
},);

describe("queryLogEntries", () => {
  test("no filters returns every row, newest first", async () => {
    const rows = await queryLogEntries(db, {},);
    expect(rows.map((r,) => r.id),).toEqual(["l4", "l3", "l2", "l1",],);
  });

  test("--event selects only that event type", async () => {
    const rows = await queryLogEntries(db, { event: "moderation.chat.ban", },);
    expect(rows.map((r,) => r.id),).toEqual(["l1",],);
  });

  test("--user selects only that user's rows", async () => {
    const rows = await queryLogEntries(db, { user: "u-2", },);
    expect(rows.map((r,) => r.id),).toEqual(["l4", "l2",],);
  });

  test("--entity <type>:<id> narrows to one entity", async () => {
    const rows = await queryLogEntries(db, { entity: "chat:c-1", },);
    expect(rows.map((r,) => r.id),).toEqual(["l3", "l1",],);
  });

  test("--entity <type> alone matches any id of that type", async () => {
    const rows = await queryLogEntries(db, { entity: "chat", },);
    expect(rows.map((r,) => r.id),).toEqual(["l3", "l2", "l1",],);
  });

  test("--level is a minimum severity filter", async () => {
    const rows = await queryLogEntries(db, { level: 40, },);
    expect(rows.map((r,) => r.id),).toEqual(["l4", "l1",],);
  });

  test("--since and --until bound created_at inclusively", async () => {
    const rows = await queryLogEntries(db, { since: "2026-01-11", until: "2026-01-12", },);
    expect(rows.map((r,) => r.id),).toEqual(["l3", "l2",],);
  });

  test("--q matches a message substring and truncates over-long patterns", async () => {
    const hit = await queryLogEntries(db, { q: "gate", },);
    expect(hit.map((r,) => r.id),).toEqual(["l4", "l3",],);

    // A pattern longer than LIKE_MAX is truncated to its first 200 chars,
    // which no stored message contains — so it matches nothing rather than
    // issuing an unbounded LIKE.
    const miss = await queryLogEntries(db, { q: `gate ${"x".repeat(300,)}`, },);
    expect(miss,).toEqual([],);
  });

  test("--limit caps the row count", async () => {
    expect((await queryLogEntries(db, { limit: 2, },)).map((r,) => r.id),).toEqual(["l4", "l3",],);
    expect((await queryLogEntries(db, { limit: LIMIT_CAP + 1_000, },)).length,).toBe(4,);
  });

  test("filters compose", async () => {
    const rows = await queryLogEntries(db, { user: "u-1", level: 30, },);
    expect(rows.map((r,) => r.id),).toEqual(["l1",],);
  });

  test("malformed selectors and timestamps throw", async () => {
    await expect(queryLogEntries(db, { entity: ":c-1", },),).rejects.toThrow(/Invalid --entity/,);
    await expect(queryLogEntries(db, { since: "nope", },),).rejects.toThrow(/Invalid ISO/,);
  });
});

describe("log-query limits", () => {
  test("DEFAULT_LIMIT is the omitted-limit default", () => {
    expect(DEFAULT_LIMIT,).toBe(50,);
  });

  test("clampLimit defaults, floors, and caps", () => {
    expect(clampLimit(),).toBe(DEFAULT_LIMIT,);
    expect(clampLimit(10,),).toBe(10,);
    expect(clampLimit(0,),).toBe(1,);
    expect(clampLimit(LIMIT_CAP + 1,),).toBe(LIMIT_CAP,);
  });

  test("LIKE_MAX caps the message-substring scan", () => {
    expect(LIKE_MAX,).toBe(200,);
  });
});

describe("normalizeTimestamp", () => {
  test("date-only input gains a midnight time", () => {
    expect(normalizeTimestamp("2026-01-11",),).toBe("2026-01-11 00:00:00",);
  });

  test("T separator, Z suffix, and fractional seconds collapse to SQLite text", () => {
    expect(normalizeTimestamp("2026-01-11T05:06:07Z",),).toBe("2026-01-11 05:06:07",);
    expect(normalizeTimestamp("2026-01-11 05:06:07.123",),).toBe("2026-01-11 05:06:07",);
  });

  test("unrecognisable input throws", () => {
    expect(() => normalizeTimestamp("nope",)).toThrow(/Invalid ISO/,);
  });
});

describe("parseEntitySelector", () => {
  test("type-only selector leaves entityId absent", () => {
    expect(parseEntitySelector("chat",),).toEqual({ entityType: "chat", },);
  });

  test("type:id selector splits on the first colon", () => {
    expect(parseEntitySelector("chat:c-1",),).toEqual({ entityType: "chat", entityId: "c-1", },);
  });

  test("empty halves throw", () => {
    expect(() => parseEntitySelector(":c-1",)).toThrow(/Invalid --entity/,);
    expect(() => parseEntitySelector("chat:",)).toThrow(/Invalid --entity/,);
  });
});

describe("formatTable", () => {
  test("renders the header plus one padded row per entry", async () => {
    const entries = await queryLogEntries(db, { event: "moderation.chat.ban", },);
    const table = formatTable(entries,);
    const lines = table.split("\n",);
    expect(lines[0],).toContain("CREATED_AT",);
    expect(lines[0],).toContain("MESSAGE",);
    expect(lines,).toHaveLength(2,);
    expect(lines[1],).toContain("banned from chat",);
  });
});

describeIsolated("main() CLI entry", () => {
  let tmpDir: string;
  let realConfigLoad: Record<string, unknown>;

  beforeAll(async () => {
    const mod = await import("../config/load");
    realConfigLoad = mod as unknown as Record<string, unknown>;
  },);

  afterAll(() => {
    mock.module("../config/load", () => realConfigLoad,);
  },);

  test("rejects :memory: SQLite filename and returns 1", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "loop-lore-logs-",),);
    try {
      mock.module("../config/load", () => ({
        ...realConfigLoad,
        loadConfig: () => ({ db: { type: "sqlite", sqliteFilename: ":memory:", }, }),
      }),);

      expect(await main(),).toBe(1,);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true, },);
    }
  });

  test("unreadable DB file returns 1 instead of throwing", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "loop-lore-logs-",),);
    try {
      mock.module("../config/load", () => ({
        ...realConfigLoad,
        loadConfig: () => ({
          db: { type: "sqlite", sqliteFilename: join(tmpDir, "missing.db",), },
        }),
      }),);

      expect(await main(),).toBe(1,);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true, },);
    }
  });

  test("happy path: returns 0 against a real on-disk DB", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "loop-lore-logs-",),);
    const dbPath = join(tmpDir, "loop-lore.db",);
    const seedSqlite = new Database(dbPath,);
    const seedDb = new Kysely<DB>({ dialect: createSqliteDialect(seedSqlite,), },);
    await runMigrations(seedDb,);
    await seedDb
      .insertInto("log_entries",)
      .values({
        id: "cli-1",
        level: 20,
        timestamp: 1_700_000_000_000,
        time: "2026-01-10 00:00:00",
        message: "cli seeded row",
        module: "test",
        user_id: null,
        session_id: null,
        request_id: null,
        meta: null,
        event_type: null,
        entity_type: null,
        entity_id: null,
        action: null,
        created_at: "2026-01-10 00:00:00",
      },)
      .execute();

    await seedDb.destroy();
    seedSqlite.close();

    try {
      mock.module("../config/load", () => ({
        ...realConfigLoad,
        loadConfig: () => ({ db: { type: "sqlite", sqliteFilename: dbPath, }, }),
      }),);

      const origLog = console.log;
      console.log = () => {};
      let code = -1;
      try {
        code = await main();
      } finally {
        console.log = origLog;
      }

      expect(code,).toBe(0,);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true, },);
    }
  });
},);

describeIsolated("CLI error path", () => {
  // Regression: the guard used to flush a *different* logger instance than the
  // one `log()` logged through, so every diagnostic was swallowed and the
  // script exited 1 in silence. Spawned as a real process — the in-process
  // `main()` tests above never run the guard, so they cannot see this.
  test("an unusable DB emits its diagnostic to stderr before exiting 1", async () => {
    const configDir = mkdtempSync(join(tmpdir(), "loop-lore-cli-cfg-",),);
    const secret = crypto.randomUUID().repeat(4,);
    const scriptPath = join(import.meta.dir, "log-query.ts",);

    writeFileSync(
      join(configDir, "config.toml",),
      `[db]\nsqliteFilename = ":memory:"\n`,
    );

    try {
      const proc = Bun.spawn({
        cmd: ["bun", "run", scriptPath,],
        cwd: configDir,
        env: { ...process.env, NSFW_FLAG_REPORTER_HASH_SECRET: secret, },
        stdout: "pipe",
        stderr: "pipe",
      },);

      const exitCode = await proc.exited;
      const stderr = await new Response(proc.stderr,).text();
      await new Response(proc.stdout,).text();

      expect(exitCode,).toBe(1,);
      expect(stderr,).toContain("requires a real on-disk DB",);
    } finally {
      rmSync(configDir, { recursive: true, force: true, },);
    }
  });
},);
