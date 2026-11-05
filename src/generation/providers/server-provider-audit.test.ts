// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the provider store audit trail — the row it writes, the shared
 * log-entry envelope every row carries and the warning it emits when the row
 * cannot be written.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { logEntryEnvelope, } from "../../db/log-entries";
import type { DB, } from "../../db/schema";
import { createLogger, getLogger, type Logger, type LoggerBindings, setGlobalLogger, } from "../../logger";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { auditProviderStore, } from "./server-provider-audit";
import { type StoredServerProvider, } from "./server-provider-descriptor";
import { warnProviderStore, } from "./server-provider-materialize";

/** One warning captured through the structured logger. */
interface CapturedWarning {
  message: string;
  meta?: Record<string, unknown>;
  module?: string;
}

/** Capture-only logger implementing the full Logger interface (child() must
 * return a capturing logger — the audit writer logs through a module child). */
class WarningCaptureLogger implements Logger {
  private readonly warnings: CapturedWarning[];
  private moduleName: string | undefined;

  /**
   * @param warnings - the array the captured warnings are pushed into
   */
  constructor(warnings: CapturedWarning[],) {
    this.warnings = warnings;
  }

  trace(): void {}
  debug(): void {}
  info(): void {}
  warn(message: string, meta?: Record<string, unknown>,): void {
    this.warnings.push({ message, meta, module: this.moduleName, },);
  }
  error(): void {}
  fatal(): void {}
  child(bindings: LoggerBindings,): Logger {
    const child = new WarningCaptureLogger(this.warnings,);
    child.moduleName = bindings.module;
    return child;
  }
  addTransport(): void {}
  setBindings(): void {}
  setLevel(): void {}
  flush(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * Run `fn` with a capturing logger installed, then restore the prior one.
 * @param fn - the code whose warnings are captured
 * @returns the captured warnings
 */
async function captureWarnings(fn: () => Promise<void>,): Promise<CapturedWarning[]> {
  const warnings: CapturedWarning[] = [];
  let prior: Logger | undefined;
  try {
    prior = getLogger();
  } catch {
    prior = undefined;
  }

  setGlobalLogger(new WarningCaptureLogger(warnings,),);
  try {
    await fn();
  } finally {
    setGlobalLogger(prior ?? createLogger({ console: false, dbEnabled: false, level: "error", },),);
  }

  return warnings;
}

/**
 * @param name - the provider instance name
 * @returns a stored provider descriptor
 */
function descriptor(name = "acme",): StoredServerProvider {
  return {
    name,
    label: "Acme",
    baseUrl: "https://api.example.com/v1",
    model: "demo-model",
    allowedHosts: ["api.example.com",],
    timeout: 30_000,
    retries: 3,
    allowUserApiKey: true,
    setDefault: false,
  };
}

let db: Kysely<DB>;
let sqlite: TestDb["sqlite"];

beforeAll(async () => {
  const tdb = await createTestDb();
  db = tdb.db;
  sqlite = tdb.sqlite;
},);

afterAll(async () => {
  sqlite.close();
},);

describe("auditProviderStore", () => {
  test("records the saved instance in the audit trail", async () => {
    await auditProviderStore(db, "saved", descriptor(), "admin-1",);

    const row = await db
      .selectFrom("log_entries",)
      .selectAll()
      .where("entity_id", "=", "acme",)
      .executeTakeFirst();

    expect(row?.message,).toBe('Provider instance "acme" saved',);
    expect(row?.module,).toBe("server-provider-store",);
    expect(row?.action,).toBe("server-provider.saved",);
    expect(row?.event_type,).toBe("admin",);
    expect(row?.entity_type,).toBe("system",);
    expect(row?.user_id,).toBe("admin-1",);
    expect(row?.level,).toBe(6,);
    expect(row?.meta,).toContain("https://api.example.com/v1",);
  });

  test("records the deletion of an instance without an actor", async () => {
    await auditProviderStore(db, "deleted", descriptor("acme-deleted",),);

    const row = await db
      .selectFrom("log_entries",)
      .selectAll()
      .where("entity_id", "=", "acme-deleted",)
      .executeTakeFirst();

    expect(row?.message,).toBe('Provider instance "acme-deleted" deleted',);
    expect(row?.action,).toBe("server-provider.deleted",);
    expect(row?.user_id,).toBeNull();
  });

  test("a failing audit row warns instead of failing the write", async () => {
    const closed = await createTestDb();
    closed.sqlite.close();

    const warnings = await captureWarnings(async () => {
      await auditProviderStore(closed.db, "saved", descriptor(), "admin-1",);
    },);

    expect(warnings.at(0,)?.message,).toBe("Could not write the provider store audit row",);
    expect(warnings.at(0,)?.module,).toBe("server-provider-store",);
    expect(warnings.at(0,)?.meta?.name,).toBe("acme",);
  });
});

describe("warnProviderStore", () => {
  test("warns through the structured logger with the store module binding", async () => {
    const warnings = await captureWarnings(async () => {
      warnProviderStore("Skipping malformed provider descriptor", { key: "provider.acme.config", },);
    },);

    expect(warnings,).toHaveLength(1,);
    expect(warnings[0]?.message,).toBe("Skipping malformed provider descriptor",);
    expect(warnings[0]?.module,).toBe("server-provider-store",);
    expect(warnings[0]?.meta,).toEqual({ key: "provider.acme.config", },);
  });
});

describe("logEntryEnvelope", () => {
  test("carries the id, level and write time every audit row shares", () => {
    const envelope = logEntryEnvelope(6,);

    expect(envelope.level,).toBe(6,);
    expect(envelope.id,).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,);
    expect(envelope.time,).toBe(new Date(envelope.timestamp,).toISOString(),);
  });

  test("gives every row its own id", () => {
    expect(logEntryEnvelope(6,).id,).not.toBe(logEntryEnvelope(6,).id,);
  });
});
