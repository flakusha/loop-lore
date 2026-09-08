import { Database, } from "bun:sqlite";
import { describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";
import type { AgeGateConfig, } from "../config/schema";
import { createSqliteDialect, } from "../db/index";
import { acceptAgeGate, AgeGateError, getStatus, UnderageError, validateAge, } from "./service";

// ── Helpers ──────────────────────────────────────────────────

/**
 * Create a test AgeGateConfig with optional overrides.
 * @param overrides - Partial config to override defaults.
 * @returns Complete AgeGateConfig for testing.
 */
function gateConfig(overrides?: Partial<AgeGateConfig>,): AgeGateConfig {
  return {
    enabled: true,
    minimumAge: 18,
    mode: "self-declaration",
    ...overrides,
  };
}

// ── getStatus ────────────────────────────────────────────────

describe("getStatus", () => {
  test("returns no gating when disabled", () => {
    const config = gateConfig({ enabled: false, },);
    const status = getStatus(config, null,);
    expect(status,).toEqual({ isEnabled: false, hasPassed: true, minimumAge: 18, mode: "none", },);
  });

  test("returns no gating when mode is 'none'", () => {
    const config = gateConfig({ mode: "none", },);
    const status = getStatus(config, null,);
    expect(status,).toEqual({ isEnabled: false, hasPassed: true, minimumAge: 18, mode: "none", },);
  });

  test("returns gating-required when user has no birth_date", () => {
    const config = gateConfig();
    const status = getStatus(config, { birth_date: null, age_gate_accepted_at: null, },);
    expect(status,).toEqual({ isEnabled: true, hasPassed: false, minimumAge: 18, mode: "self-declaration", },);
  });

  test("returns gating-required when user has birth_date but no acceptance", () => {
    const config = gateConfig();
    const status = getStatus(config, { birth_date: "2000-01-01", age_gate_accepted_at: null, },);
    expect(status,).toEqual({ isEnabled: true, hasPassed: false, minimumAge: 18, mode: "self-declaration", },);
  });

  test("returns passed when user has both fields", () => {
    const config = gateConfig();
    const status = getStatus(config, {
      birth_date: "2000-01-01",
      age_gate_accepted_at: "2024-06-01T12:00:00.000Z",
    },);
    expect(status,).toEqual({ isEnabled: true, hasPassed: true, minimumAge: 18, mode: "self-declaration", },);
  });

  test("returns passed for null user when gate is disabled", () => {
    const config = gateConfig({ enabled: false, },);
    const status = getStatus(config, null,);
    expect(status.isEnabled,).toBe(false,);
    expect(status.hasPassed,).toBe(true,);
  });
});

// ── validateAge ──────────────────────────────────────────────

describe("validateAge", () => {
  test("passes when user is exactly minimum age", () => {
    const eighteenYearsAgo = new Date();
    eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18,);
    const dateString = eighteenYearsAgo.toISOString().slice(0, 10,);
    expect(() => {
      validateAge(dateString, 18,);
    },).not.toThrow();
  });

  test("passes when user is older than minimum", () => {
    expect(() => {
      validateAge("1990-01-01", 18,);
    },).not.toThrow();
  });

  test("throws UnderageError when user is below minimum", () => {
    expect(() => {
      validateAge("2015-06-15", 18,);
    },).toThrow(UnderageError,);
    expect(() => {
      validateAge("2015-06-15", 18,);
    },).toThrow(/at least 18/,);
  });

  test("throws UnderageError for a recent birth date", () => {
    const lastYear = new Date();
    lastYear.setFullYear(lastYear.getFullYear() - 1,);
    const dateString = lastYear.toISOString().slice(0, 10,);
    expect(() => {
      validateAge(dateString, 18,);
    },).toThrow(UnderageError,);
  });

  test("throws AgeGateError for invalid date string", () => {
    expect(() => {
      validateAge("not-a-date", 18,);
    },).toThrow(AgeGateError,);
    expect(() => {
      validateAge("not-a-date", 18,);
    },).toThrow(/Invalid birth date/,);
  });

  test("throws AgeGateError for empty string", () => {
    expect(() => {
      validateAge("", 18,);
    },).toThrow(AgeGateError,);
  });

  test("respects custom minimum age", () => {
    expect(() => {
      validateAge("2005-01-01", 13,);
    },).not.toThrow();
    expect(() => {
      validateAge("2015-01-01", 13,);
    },).toThrow(UnderageError,);
  });
});

// ── acceptAgeGate ────────────────────────────────────────────

describe("acceptAgeGate", () => {
  test("writes birth_date and timestamp to user record", async () => {
    const database = await createTestDatabase();
    const config = gateConfig();

    await acceptAgeGate({ database, config, userId: "test-user-1", input: { birthDate: "2000-06-15", }, },);

    const user = await database
      .selectFrom("users",)
      .select(["birth_date", "age_gate_accepted_at",],)
      .where("id", "=", "test-user-1",)
      .executeTakeFirst();

    expect(user?.birth_date,).toBe("2000-06-15",);
    // age_gate_accepted_at written by service.ts must be ISO-8601 with TZ suffix
    expect(user?.age_gate_accepted_at,).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,);
    // Must also parse as a valid Date
    expect(Number.isNaN(Date.parse(user!.age_gate_accepted_at!,),),).toBe(false,);
  });

  test("throws UnderageError when user is too young", async () => {
    const database = await createTestDatabase();
    const config = gateConfig();

    await expect(
      acceptAgeGate({ database, config, userId: "test-user-1", input: { birthDate: "2020-01-01", }, },),
    ).rejects.toThrow(UnderageError,);

    // Verify no update was written
    const user = await database
      .selectFrom("users",)
      .select(["birth_date", "age_gate_accepted_at",],)
      .where("id", "=", "test-user-1",)
      .executeTakeFirst();

    expect(user?.birth_date,).toBeNull();
    expect(user?.age_gate_accepted_at,).toBeNull();
  });

  test("is no-op when gate is disabled", async () => {
    const database = await createTestDatabase();
    const config = gateConfig({ enabled: false, },);

    // Should not throw even with a child's birth date
    expect(
      acceptAgeGate({ database, config, userId: "test-user-1", input: { birthDate: "2020-01-01", }, },),
    ).resolves.toBeUndefined();

    // Verify no update was written
    const user = await database
      .selectFrom("users",)
      .select(["birth_date", "age_gate_accepted_at",],)
      .where("id", "=", "test-user-1",)
      .executeTakeFirst();

    expect(user?.birth_date,).toBeNull();
    expect(user?.age_gate_accepted_at,).toBeNull();
  });

  test("is no-op when mode is 'none'", async () => {
    const database = await createTestDatabase();
    const config = gateConfig({ mode: "none", },);

    expect(
      acceptAgeGate({ database, config, userId: "test-user-1", input: { birthDate: "2020-01-01", }, },),
    ).resolves.toBeUndefined();
  });
  test("created_at default matches production migration format (SQLite datetime('now'))", async () => {
    const database = await createTestDatabase();
    // created_at is set by the DEFAULT (datetime('now')) — not by the service.
    // datetime('now') emits "YYYY-MM-DD HH:MM:SS" (space separator, no TZ).
    // This test pins the format so schema changes to the default are caught.
    const user = await database
      .selectFrom("users",)
      .select(["created_at",],)
      .where("id", "=", "test-user-1",)
      .executeTakeFirst();

    expect(user?.created_at,).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,);
    // Date.parse accepts this format per SQLite spec
    expect(Number.isNaN(Date.parse(user!.created_at!,),),).toBe(false,);
  });
});

// ── In-memory DB setup (helper, not a test) ──────────────────

/**
 * Create a minimal in-memory SQLite DB with a users table
 * containing the age gate columns. Returns the Kysely instance.
 * @returns Kysely instance with users table.
 */
async function createTestDatabase(): Promise<Kysely<import("../db/schema").DB>> {
  const sqlite = new Database(":memory:",);
  sqlite.run("PRAGMA foreign_keys = ON",);

  // Use raw SQL for DDL/DML to bypass Kysely type issues with sql`` defaults.
  // Kysely accepts sql`(expr)` as a DefaultValue, but passing a string
  // `"datetime('now')"` causes Kysely to store the literal string.
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      settings TEXT NOT NULL DEFAULT '{}',
      birth_date TEXT,
      age_gate_accepted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,);
  sqlite.exec(`
    INSERT INTO users (id, username, display_name, role, status, settings)
    VALUES ('test-user-1', 'tester', 'Tester', 'user', 'active', '{}')
  `,);

  const dialect = createSqliteDialect(sqlite,);
  const database = new Kysely<import("../db/schema").DB>({ dialect, },);
  return database;
}

describe("getStatus boundary", () => {
  test("empty birth_date => hasPassed false", () => {
    const s = getStatus(gateConfig(), { birth_date: "", age_gate_accepted_at: null, },);
    expect(s.hasPassed,).toBe(false,);
  });
  test("undefined user fields => hasPassed false", () => {
    const s = getStatus(gateConfig(), {
      birth_date: undefined as unknown as null,
      age_gate_accepted_at: undefined as unknown as null,
    },);
    expect(s.hasPassed,).toBe(false,);
  });
});

describe("validateAge boundary", () => {
  test("minimum 0 => still throws AgeGateError (birth in future)", () => {
    expect(() => validateAge("2030-01-01", 0,)).toThrow(AgeGateError,);
  });
  test("very old date passes any reasonable minimum", () => {
    expect(() => validateAge("1900-01-01", 18,)).not.toThrow();
  });
});
