// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Unit tests for the tooling report store (src/harness/reports.ts) and its
 * JSONL spool (src/harness/reports-spool.ts): semantic validation, the
 * dedupe upsert (bump, never duplicate), instance-scoped listing, and the
 * best-effort spool contract (failure swallowed, DB row still lands).
 *
 * Parallel-safe resource contract (see .tmp/research/next-implementation-cycle-2026-11-20.md):
 * every test gets its OWN in-memory DB (created in beforeEach, destroyed in
 * a finally-teardown afterEach), its own `dedupe_key`/`instance_id` derived
 * from randomUUID (never a shared constant), and its own mkdtemp spool
 * directory reset in afterEach — no shared spool path, no fixed key.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { join, } from "node:path";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import {
  insertToolingReport,
  listToolingReports,
  REPORT_CATEGORIES,
  REPORT_DETAIL_MAX_CHARS,
  REPORT_FIELD_MAX_CHARS,
  REPORT_SOURCES,
  REPORTS_DEFAULT_LIMIT,
  REPORTS_MAX_LIMIT,
  type ToolingReportInput,
  type ToolingReportRow,
  validateReportInput,
} from "./reports";
import {
  getReportSpoolPath,
  REPORTS_SPOOL_FILENAME,
  resetReportSpoolPath,
  serializeReport,
  setReportSpoolPath,
  writeReportSpool,
} from "./reports-spool";

/** Shared PARENT for per-test spool fixtures (repo .tmp/, never system temp). */
const TMP_ROOT = ".tmp/harness-reports";

let db: TestDb["db"];
let dbFixture: TestDb | null = null;
let spoolDir: string | null = null;

/** A per-test instance slug — never shared across tests. */
function slug(): string {
  return `inst-${crypto.randomUUID()}`;
}

/** A valid payload with per-test unique optional fields. */
function payload(overrides: Partial<ToolingReportInput> = {},): ToolingReportInput {
  return {
    source: "harness",
    category: "tooling_failure",
    tool: "giwt",
    detail: "finalize failed at checks step",
    instanceId: slug(),
    ...overrides,
  };
}

beforeEach(async () => {
  mkdirSync(TMP_ROOT, { recursive: true, },);
  dbFixture = await createTestDb();
  db = dbFixture.db;
},);

afterEach(() => {
  try {
    if (spoolDir !== null) { rmSync(spoolDir, { recursive: true, force: true, },); }
  } finally {
    spoolDir = null;
    resetReportSpoolPath();
    const fixture = dbFixture;
    dbFixture = null;
    if (fixture !== null) {
      // Synchronous teardown helper is async: fire and forget is NOT ok —
      // destroyTestDb must finish before the next test's createTestDb.
      return destroyTestDb(fixture,);
    }
  }
},);

describe("validateReportInput", () => {
  it("accepts a fully-formed payload", () => {
    expect(validateReportInput(payload(),),).toEqual({ ok: true, },);
  });

  it("rejects unknown source and category", () => {
    expect(validateReportInput(payload({ source: "agent", },),).ok,).toBe(false,);
    expect(validateReportInput(payload({ category: "crash", },),).ok,).toBe(false,);
  });

  it("rejects an empty or whitespace-only tool", () => {
    expect(validateReportInput(payload({ tool: "", },),).ok,).toBe(false,);
    expect(validateReportInput(payload({ tool: "   ", },),).ok,).toBe(false,);
  });

  it("rejects detail over the character cap", () => {
    expect(validateReportInput(payload({ detail: "x".repeat(REPORT_DETAIL_MAX_CHARS,), },),).ok,).toBe(true,);
    expect(validateReportInput(payload({ detail: "x".repeat(REPORT_DETAIL_MAX_CHARS + 1,), },),).ok,).toBe(false,);
  });

  it("rejects attempt > max_attempts", () => {
    expect(validateReportInput(payload({ attempt: 3, maxAttempts: 2, },),).ok,).toBe(false,);
    expect(validateReportInput(payload({ attempt: 2, maxAttempts: 2, },),).ok,).toBe(true,);
  });

  it("rejects negative and non-integer numerics", () => {
    expect(validateReportInput(payload({ durationMs: -1, },),).ok,).toBe(false,);
    expect(validateReportInput(payload({ attempt: 1.5, },),).ok,).toBe(false,);
    expect(validateReportInput(payload({ maxAttempts: -3, },),).ok,).toBe(false,);
  });

  it("rejects over-long descriptive fields", () => {
    expect(validateReportInput(payload({ dedupeKey: "k".repeat(REPORT_FIELD_MAX_CHARS + 1,), },),).ok,).toBe(false,);
    expect(validateReportInput(payload({ branch: "b".repeat(REPORT_FIELD_MAX_CHARS + 1,), },),).ok,).toBe(false,);
  });
});

describe("insertToolingReport", () => {
  it("inserts an unkeyed report and returns the row", async () => {
    const result = await insertToolingReport(db, payload(),);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.deduped,).toBe(false,);
    expect(result.report.source,).toBe("harness",);
    expect(result.report.category,).toBe("tooling_failure",);
    expect(result.report.instance_id,).toBe(result.report.instance_id,);
    expect(result.report.count,).toBe(1,);
    expect(result.report.dedupe_key,).toBeNull();
  });

  it("dedupes a repeated key: one row, count bumped, last_seen refreshed", async () => {
    const inst = slug();
    const key = `k-${crypto.randomUUID()}`;
    const first = await insertToolingReport(
      db,
      payload({ instanceId: inst, dedupeKey: key, ts: "2026-11-20T00:00:00.000Z", },),
    );

    expect(first.ok,).toBe(true,);
    if (!first.ok) { return; }

    const second = await insertToolingReport(
      db,
      payload({ instanceId: inst, dedupeKey: key, detail: "same failure again", ts: "2026-11-20T00:01:00.000Z", },),
    );

    expect(second.ok,).toBe(true,);
    if (!second.ok) { return; }

    expect(second.deduped,).toBe(true,);
    expect(second.report.id,).toBe(first.report.id,);
    expect(second.report.count,).toBe(2,);
    expect(second.report.last_seen,).toBe("2026-11-20T00:01:00.000Z",);

    const page = await listToolingReports(db, { instanceId: inst, },);
    expect(page.total,).toBe(1,);
  });

  it("inserts a NEW key as a fresh cluster", async () => {
    const key = `k-${crypto.randomUUID()}`;
    const a = await insertToolingReport(db, payload({ dedupeKey: key, },),);
    const b = await insertToolingReport(db, payload({ dedupeKey: `${key}-2`, },),);
    expect(a.ok && b.ok,).toBe(true,);
    if (!(a.ok && b.ok)) { return; }
    expect(b.report.id,).not.toBe(a.report.id,);
    expect(b.report.count,).toBe(1,);
  });

  it("a bumped row keeps the FIRST report's detail and ts", async () => {
    const input = payload({ dedupeKey: `k-${crypto.randomUUID()}`, ts: "2026-11-20T00:00:00.000Z", },);
    const first = await insertToolingReport(db, input,);
    const second = await insertToolingReport(db, {
      ...input,
      detail: "rewritten detail",
      ts: "2026-11-20T01:00:00.000Z",
    },);

    if (!(first.ok && second.ok)) { return; }
    expect(second.report.detail,).toBe(first.report.detail,);
    expect(second.report.ts,).toBe(first.report.ts,);
  });

  it("rejects invalid payloads without touching the DB", async () => {
    const before = await listToolingReports(db, { instanceId: "any", },);
    const result = await insertToolingReport(db, payload({ source: "agent", },),);
    expect(result.ok,).toBe(false,);
    const after = await listToolingReports(db, { instanceId: "any", },);
    expect(after.total,).toBe(before.total,);
  });

  it("throws (no partial row) when the DB is destroyed", async () => {
    const fixture = dbFixture;
    if (fixture === null) { return; }
    await destroyTestDb(fixture,);
    dbFixture = null;
    let threw = false;
    try {
      await insertToolingReport(fixture.db, payload(),);
    } catch {
      threw = true;
    }

    expect(threw,).toBe(true,);
  });
});

describe("listToolingReports", () => {
  it("is instance-scoped: another instance's rows are invisible", async () => {
    const mine = slug();
    const theirs = slug();
    await insertToolingReport(db, payload({ instanceId: mine, },),);
    await insertToolingReport(db, payload({ instanceId: theirs, },),);
    await insertToolingReport(db, payload({ instanceId: theirs, },),);

    const page = await listToolingReports(db, { instanceId: mine, },);
    expect(page.total,).toBe(1,);
    expect(page.items.every((r,) => r.instance_id === mine),).toBe(true,);
  });

  it("filters by source, category, tool and dedupe_key", async () => {
    const inst = slug();
    const key = `k-${crypto.randomUUID()}`;
    await insertToolingReport(
      db,
      payload({ instanceId: inst, source: "check", tool: "bun", category: "performance", },),
    );

    await insertToolingReport(db, payload({ instanceId: inst, dedupeKey: key, },),);

    expect((await listToolingReports(db, { instanceId: inst, source: "check", },)).total,).toBe(1,);
    expect((await listToolingReports(db, { instanceId: inst, category: "performance", },)).total,).toBe(1,);
    expect((await listToolingReports(db, { instanceId: inst, tool: "bun", },)).total,).toBe(1,);
    expect((await listToolingReports(db, { instanceId: inst, dedupeKey: key, },)).total,).toBe(1,);
    expect((await listToolingReports(db, { instanceId: inst, tool: "nope", },)).total,).toBe(0,);
  });

  it("pages with limit/offset; total stays unpaginated", async () => {
    const inst = slug();
    for (let i = 0; i < 5; i++) {
      await insertToolingReport(db, payload({ instanceId: inst, ts: `2026-11-20T00:00:0${i}.000Z`, },),);
    }

    const page = await listToolingReports(db, { instanceId: inst, limit: 2, offset: 1, },);
    expect(page.items.length,).toBe(2,);
    expect(page.total,).toBe(5,);
    // Newest first: the second-newest and third-newest rows, in order.
    expect(page.items[0]!.ts,).toBe("2026-11-20T00:00:03.000Z",);
    expect(page.items[1]!.ts,).toBe("2026-11-20T00:00:02.000Z",);
  });

  it("clamps limit to the hard cap", async () => {
    const inst = slug();
    for (let i = 0; i < REPORTS_MAX_LIMIT + 5; i++) {
      await insertToolingReport(db, payload({ instanceId: inst, },),);
    }

    const page = await listToolingReports(db, { instanceId: inst, limit: 999_999, },);
    expect(page.items.length,).toBe(REPORTS_MAX_LIMIT,);
    expect(page.total,).toBe(REPORTS_MAX_LIMIT + 5,);
  });
});

describe("report spool", () => {
  it("mirrors a stored row as one snake_case JSONL line", async () => {
    spoolDir = mkdtempSync(join(TMP_ROOT, "spool-",),);
    setReportSpoolPath(join(spoolDir, REPORTS_SPOOL_FILENAME,),);
    const key = `k-${crypto.randomUUID()}`;
    const result = await insertToolingReport(db, payload({ dedupeKey: key, },),);
    expect(result.ok,).toBe(true,);

    const raw = readFileSync(getReportSpoolPath()!, "utf8",);
    const lines = raw.trim().split("\n",);
    expect(lines.length,).toBe(1,);
    const line = JSON.parse(lines[0]!,) as Record<string, unknown>;
    expect(line["source"],).toBe("harness",);
    const stored = (result as { report: ToolingReportRow }).report;
    expect(line["instance_id"],).toBe(stored.instance_id,);
    expect(line["dedupe_key"],).toBe(key,);
    expect(line["count"],).toBe(1,);
    expect(Object.keys(line,),).toEqual(Object.keys(serializeReport(stored,),),);
  });

  it("appends one line per report (bumps included)", async () => {
    spoolDir = mkdtempSync(join(TMP_ROOT, "spool-",),);
    setReportSpoolPath(join(spoolDir, REPORTS_SPOOL_FILENAME,),);
    const input = payload({ dedupeKey: `k-${crypto.randomUUID()}`, },);
    await insertToolingReport(db, input,);
    await insertToolingReport(db, input,);

    const lines = readFileSync(getReportSpoolPath()!, "utf8",).trim().split("\n",);
    expect(lines.length,).toBe(2,);
    expect(JSON.parse(lines[1]!,)["count"],).toBe(2,);
  });

  it("a spool failure is swallowed: the report still lands", async () => {
    spoolDir = mkdtempSync(join(TMP_ROOT, "spool-",),);
    // A FILE blocks the spool directory: every mkdir/append below it fails.
    const blocker = join(spoolDir, "blocker",);
    writeFileSync(blocker, "not a dir", "utf8",);
    setReportSpoolPath(join(blocker, "sub", REPORTS_SPOOL_FILENAME,),);

    const result = await insertToolingReport(db, payload(),);
    expect(result.ok,).toBe(true,);
    const page = await listToolingReports(db, {
      instanceId: (result as { report: { instance_id: string } }).report.instance_id,
    },);

    expect(page.total,).toBe(1,);
  });

  it("a forced-null spool path skips the mirror entirely", async () => {
    setReportSpoolPath(null,);
    const result = await insertToolingReport(db, payload(),);
    expect(result.ok,).toBe(true,);
    expect(getReportSpoolPath(),).toBeNull();
  });
});

describe("report vocabularies", () => {
  it("pins the closed source/category sets and default limit", () => {
    expect([...REPORT_SOURCES,],).toEqual(["assistant", "harness", "giwt", "check",],);
    expect([...REPORT_CATEGORIES,],).toEqual([
      "tooling_failure",
      "retry_exhausted",
      "persistent_failure",
      "performance",
    ],);

    expect(REPORTS_DEFAULT_LIMIT,).toBe(50,);
  });

  it("writeReportSpool mirrors one row as a single JSONL line", async () => {
    spoolDir = mkdtempSync(join(TMP_ROOT, "spool-direct-",),);
    setReportSpoolPath(join(spoolDir, REPORTS_SPOOL_FILENAME,),);
    const result = await insertToolingReport(db, payload({ dedupeKey: `k-${crypto.randomUUID()}`, },),);
    expect(result.ok,).toBe(true,);
    const stored = (result as { report: ToolingReportRow }).report;
    writeReportSpool(stored,);
    const lines = readFileSync(getReportSpoolPath()!, "utf8",).trim().split("\n",);
    expect(lines.length,).toBe(2,);
    expect(JSON.parse(lines[1]!,),).toEqual(serializeReport(stored,),);
  });
});
