import { describe, test, expect } from "bun:test";
import { getStatus, validateAge, acceptAgeGate, AgeGateError, UnderageError } from "./service";
import type { AgeGateConfig } from "../config/schema";

// ── Helpers ──────────────────────────────────────────────────

function gateConfig(overrides?: Partial<AgeGateConfig>): AgeGateConfig {
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
    const config = gateConfig({ enabled: false });
    const status = getStatus(config, null);
    expect(status).toEqual({ isEnabled: false, hasPassed: true, minimumAge: 18, mode: "none" });
  });

  test("returns no gating when mode is 'none'", () => {
    const config = gateConfig({ mode: "none" });
    const status = getStatus(config, null);
    expect(status).toEqual({ isEnabled: false, hasPassed: true, minimumAge: 18, mode: "none" });
  });

  test("returns gating-required when user has no birth_date", () => {
    const config = gateConfig();
    const status = getStatus(config, { birth_date: null, age_gate_accepted_at: null });
    expect(status).toEqual({ isEnabled: true, hasPassed: false, minimumAge: 18, mode: "self-declaration" });
  });

  test("returns gating-required when user has birth_date but no acceptance", () => {
    const config = gateConfig();
    const status = getStatus(config, { birth_date: "2000-01-01", age_gate_accepted_at: null });
    expect(status).toEqual({ isEnabled: true, hasPassed: false, minimumAge: 18, mode: "self-declaration" });
  });

  test("returns passed when user has both fields", () => {
    const config = gateConfig();
    const status = getStatus(config, {
      birth_date: "2000-01-01",
      age_gate_accepted_at: "2024-06-01T12:00:00.000Z",
    });
    expect(status).toEqual({ isEnabled: true, hasPassed: true, minimumAge: 18, mode: "self-declaration" });
  });

  test("returns passed for null user when gate is disabled", () => {
    const config = gateConfig({ enabled: false });
    const status = getStatus(config, null);
    expect(status.isEnabled).toBe(false);
    expect(status.hasPassed).toBe(true);
  });
});

// ── validateAge ──────────────────────────────────────────────

describe("validateAge", () => {
  test("passes when user is exactly minimum age", () => {
    const eighteenYearsAgo = new Date();
    eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18);
    const dateString = eighteenYearsAgo.toISOString().slice(0, 10);
    expect(() => {
      validateAge(dateString, 18);
    }).not.toThrow();
  });

  test("passes when user is older than minimum", () => {
    expect(() => {
      validateAge("1990-01-01", 18);
    }).not.toThrow();
  });

  test("throws UnderageError when user is below minimum", () => {
    expect(() => {
      validateAge("2015-06-15", 18);
    }).toThrow(UnderageError);
    expect(() => {
      validateAge("2015-06-15", 18);
    }).toThrow(/at least 18/);
  });

  test("throws UnderageError for a recent birth date", () => {
    const lastYear = new Date();
    lastYear.setFullYear(lastYear.getFullYear() - 1);
    const dateString = lastYear.toISOString().slice(0, 10);
    expect(() => {
      validateAge(dateString, 18);
    }).toThrow(UnderageError);
  });

  test("throws AgeGateError for invalid date string", () => {
    expect(() => {
      validateAge("not-a-date", 18);
    }).toThrow(AgeGateError);
    expect(() => {
      validateAge("not-a-date", 18);
    }).toThrow(/Invalid birth date/);
  });

  test("throws AgeGateError for empty string", () => {
    expect(() => {
      validateAge("", 18);
    }).toThrow(AgeGateError);
  });

  test("respects custom minimum age", () => {
    expect(() => {
      validateAge("2005-01-01", 13);
    }).not.toThrow();
    expect(() => {
      validateAge("2015-01-01", 13);
    }).toThrow(UnderageError);
  });
});

// ── acceptAgeGate ────────────────────────────────────────────

describe("acceptAgeGate", () => {
  test("writes birth_date and timestamp to user record", async () => {
    const database = await createTestDatabase();
    const config = gateConfig();

    await acceptAgeGate(database, config, "test-user-1", { birthDate: "2000-06-15" });

    const user = await database
      .selectFrom("users")
      .select(["birth_date", "age_gate_accepted_at"])
      .where("id", "=", "test-user-1")
      .executeTakeFirst();

    expect(user?.birth_date).toBe("2000-06-15");
    expect(user?.age_gate_accepted_at).toBeTruthy();
  });

  test("throws UnderageError when user is too young", async () => {
    const database = await createTestDatabase();
    const config = gateConfig();

    // eslint-disable-next-line @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression
    await expect(acceptAgeGate(database, config, "test-user-1", { birthDate: "2020-01-01" })).rejects.toThrow(
      UnderageError,
    );

    // Verify no update was written
    const user = await database
      .selectFrom("users")
      .select(["birth_date", "age_gate_accepted_at"])
      .where("id", "=", "test-user-1")
      .executeTakeFirst();

    expect(user?.birth_date).toBeNull();
    expect(user?.age_gate_accepted_at).toBeNull();
  });

  test("is no-op when gate is disabled", async () => {
    const database = await createTestDatabase();
    const config = gateConfig({ enabled: false });

    // Should not throw even with a child's birth date
    expect(
      acceptAgeGate(database, config, "test-user-1", { birthDate: "2020-01-01" }),
    ).resolves.toBeUndefined();

    // Verify no update was written
    const user = await database
      .selectFrom("users")
      .select(["birth_date", "age_gate_accepted_at"])
      .where("id", "=", "test-user-1")
      .executeTakeFirst();

    expect(user?.birth_date).toBeNull();
    expect(user?.age_gate_accepted_at).toBeNull();
  });

  test("is no-op when mode is 'none'", async () => {
    const database = await createTestDatabase();
    const config = gateConfig({ mode: "none" });

    expect(
      acceptAgeGate(database, config, "test-user-1", { birthDate: "2020-01-01" }),
    ).resolves.toBeUndefined();
  });
});

// ── In-memory DB setup (helper, not a test) ──────────────────

/**
 * Create a minimal in-memory SQLite DB with a users table
 * containing the age gate columns. Returns the Kysely instance.
 */
async function createTestDatabase() {
  const { Database } = await import("bun:sqlite");
  const { Kysely: KyselyClass, SqliteDialect } = await import("kysely");

  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA foreign_keys = ON");

  const dialect = new SqliteDialect({
    database: {
      close: () => {
        sqlite.close();
      },
      prepare: (sql: string) => {
        const statement = sqlite.prepare(sql);
        return {
          get reader() {
            const s = sql.trim().toUpperCase();
            return s.startsWith("SELECT") || s.startsWith("WITH") || s.startsWith("PRAGMA");
          },
          all: (parameters: readonly unknown[]) => statement.all(...(parameters as never[])),
          run: (parameters: readonly unknown[]) => statement.run(...(parameters as never[])),
          iterate: function* (parameters: readonly unknown[]) {
            yield* statement.all(...(parameters as never[]));
          },
        };
      },
    },
  });

  const database = new KyselyClass<import("../db/schema").DB>({ dialect });

  await database.schema
    .createTable("users")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("username", "text", (col) => col.notNull().unique())
    .addColumn("display_name", "text", (col) => col.notNull())
    .addColumn("role", "text", (col) => col.notNull().defaultTo("user"))
    .addColumn("settings", "text", (col) => col.notNull().defaultTo("{}"))
    .addColumn("birth_date", "text")
    .addColumn("age_gate_accepted_at", "text")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .execute();

  await database
    .insertInto("users")
    .values({
      id: "test-user-1",
      username: "tester",
      display_name: "Tester",
      role: "user",
      settings: "{}",
    })
    .execute();

  return database;
}
