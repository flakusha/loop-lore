// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for shared RPG service utilities.
 *
 * Pure helpers (nowAndId shape, assert branches, parseJsonField
 * fallback matrix) run directly; getOrCreateRow and the getRpgLog
 * module delegation run against a real in-memory DB / logger root.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema.js";
import { createLogger, getLogger, setGlobalLogger, } from "../../logger/index.js";
import type { Logger, LoggerBindings, } from "../../logger/index.js";
import { createTestDb, } from "../../test-utils/create-test-db.js";
import { uid, } from "../../utils.js";
import {
  assertRowDeleted,
  assertRowUpdated,
  getOrCreateRow,
  getRpgLog,
  nowAndId,
  parseJsonField,
} from "./rpg-service-utils.js";

let db: Kysely<DB>;

beforeAll(async () => {
  ({ db, } = await createTestDb());
},);

afterAll(async () => {
  await db.destroy();
},);

describe("nowAndId", () => {
  test("returns a uuid id and an ISO timestamp", () => {
    const { id, now, } = nowAndId();
    expect(id,).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(Number.isNaN(Date.parse(now,),),).toBe(false,);
    expect(new Date(now,).toISOString(),).toBe(now,);
  });

  test("generates unique ids across calls", () => {
    expect(nowAndId().id,).not.toBe(nowAndId().id,);
  });
});

describe("assertRowUpdated / assertRowDeleted", () => {
  test("assertRowUpdated throws a labeled not-found error on zero rows", () => {
    expect(() => assertRowUpdated(0, "Loot table",)).toThrow("Loot table not found",);
  });

  test("assertRowUpdated passes through on nonzero rows", () => {
    expect(assertRowUpdated(1, "Loot table",),).toBeUndefined();
    expect(assertRowUpdated(5, "Loot table",),).toBeUndefined();
  });

  test("assertRowDeleted throws a labeled not-found error on zero rows", () => {
    expect(() => assertRowDeleted(0, "Battle",)).toThrow("Battle not found",);
  });

  test("assertRowDeleted passes through on nonzero rows", () => {
    expect(assertRowDeleted(2, "Battle",),).toBeUndefined();
  });
});

describe("parseJsonField", () => {
  test("parses valid JSON strings", () => {
    expect(parseJsonField<{ a: number }>('{"a":1}', { a: 0, },),).toEqual({ a: 1, },);
    expect(parseJsonField<string[]>('["x","y"]', [],),).toEqual(["x", "y",],);
  });

  test("returns the fallback for malformed JSON", () => {
    const fallback = { a: 0, };
    expect(parseJsonField("{not-json", fallback,),).toBe(fallback,);
  });

  test("returns the fallback for non-string input", () => {
    const fallback = ["d",];
    expect(parseJsonField(undefined, fallback,),).toBe(fallback,);
    expect(parseJsonField(null, fallback,),).toBe(fallback,);
    expect(parseJsonField(42, fallback,),).toBe(fallback,);
    expect(parseJsonField({ a: 1, }, fallback,),).toBe(fallback,);
  });
});

describe("getOrCreateRow", () => {
  test("inserts and returns the new row when none exists", async () => {
    const id = uid();
    const result = await getOrCreateRow(db, "loot_tables", () =>
      db.selectFrom("loot_tables",)
        .where("id", "=", id,)
        .selectAll()
        .executeTakeFirst(), {
      id,
      name: "Fresh Table",
      source_type: "test",
      source_id: null,
      total_weight: 0,
      used: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },);
    expect(result.id,).toBe(id,);
    expect(result.name,).toBe("Fresh Table",);

    const persisted = await db.selectFrom("loot_tables",)
      .where("id", "=", id,)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(persisted.name,).toBe("Fresh Table",);
  });

  test("returns the existing row without overwriting it", async () => {
    const id = uid();
    await db.insertInto("loot_tables",)
      .values({ id, name: "Original", source_type: "test", },)
      .execute();
    const result = await getOrCreateRow(db, "loot_tables", () =>
      db.selectFrom("loot_tables",)
        .where("id", "=", id,)
        .selectAll()
        .executeTakeFirst(), {
      id,
      name: "Replacement",
      source_type: "test",
      source_id: null,
      total_weight: 0,
      used: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },);
    expect(result.name,).toBe("Original",);

    const persisted = await db.selectFrom("loot_tables",)
      .where("id", "=", id,)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(persisted.name,).toBe("Original",);
  });
});

describe("getRpgLog", () => {
  test("delegates to the root logger child with the module binding", () => {
    createLogger({ level: "fatal", },);
    const real = getLogger();
    const seen: LoggerBindings[] = [];
    const child: Logger = {
      trace: () => {},
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      fatal: () => {},
      child: () => child,
      addTransport: () => {},
      setBindings: () => {},
      flush: () => Promise.resolve(),
    };
    const stub: Logger = {
      trace: () => {},
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      fatal: () => {},
      child: (bindings,) => {
        seen.push(bindings,);
        return child;
      },
      addTransport: () => {},
      setBindings: () => {},
      flush: () => Promise.resolve(),
    };
    setGlobalLogger(stub,);
    try {
      const log = getRpgLog("seduction",);
      expect(log,).toBe(child,);
      expect(seen,).toEqual([{ module: "seduction", },],);

      getRpgLog("pathfinding",);
      expect(seen,).toEqual([{ module: "seduction", }, { module: "pathfinding", },],);
    } finally {
      setGlobalLogger(real,);
    }
  });
});
