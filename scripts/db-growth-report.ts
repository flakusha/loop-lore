// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * scripts/db-growth-report.ts — DB growth measurement baseline.
 *
 * Emits per-table byte totals + row counts so db-slicing work can cite
 * numbers. Read-only: opens the database with `readonly: true`.
 *
 * Bytes come from the `dbstat` virtual table when the SQLite build provides
 * it (exact per-table totals); otherwise it falls back to proportional
 * page_count * page_size arithmetic over the whole file. Row counts are
 * `SELECT COUNT(*)` per user table.
 *
 * Usage: `bun run db:growth [--json]` with `LOOP_LORE_DB_PATH` to override
 * the database path (defaults to the XDG per-instance `loop-lore.db`).
 */

import { Database, } from "bun:sqlite";
import { resolveDbPath, } from "../packages/core/src/config/state-dir";

const DB_PATH = resolveDbPath();

/** One per-table report row. */
interface TableReport {
  table: string;
  rows: number;
  bytes: number;
  bytesHuman: string;
}

/** Full report: deterministic (tables sorted by name). */
interface GrowthReport {
  dbPath: string;
  source: "dbstat" | "pageEstimate";
  tables: TableReport[];
}

/** User (non-internal) table names from sqlite_master, sorted. */
function listTables(db: Database,): string[] {
  const rows = db.query<{ name: string }, []>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  ).all();
  return rows.map((r,) => r.name);
}

/** Row count for one table. */
function rowCount(db: Database, table: string,): number {
  // Table names come from sqlite_master itself; quoting guards embedded chars.
  return db.query<{ n: number }, []>(
    `SELECT COUNT(*) AS n FROM "${table.replaceAll('"', '""',)}"`,
  ).get()!.n;
}

/** True when the connection exposes a working dbstat virtual table. */
function hasDbstat(db: Database,): boolean {
  try {
    db.query(`SELECT pgsize FROM dbstat LIMIT 1`,).get();
    return true;
  } catch {
    return false;
  }
}

/** Per-table byte totals via dbstat. */
function bytesViaDbstat(db: Database,): Map<string, number> {
  const map = new Map<string, number>();
  const rows = db.query<{ name: string; bytes: number }, []>(
    `SELECT name, SUM(pgsize) AS bytes FROM dbstat GROUP BY name`,
  ).all();
  for (const r of rows) {
    map.set(r.name, (map.get(r.name,) ?? 0) + r.bytes,);
  }
  return map;
}

/**
 * Fallback: approximate per-table bytes by distributing total file size
 * proportionally to each table's row count.
 */
function bytesViaPageEstimate(db: Database, tables: string[],): Map<string, number> {
  const pageSize = db.query<{ v: number }, []>(`PRAGMA page_size`,).get()!.v;
  const pageCount = db.query<{ v: number }, []>(`PRAGMA page_count`,).get()!.v;
  const total = pageSize * pageCount;
  const counts = tables.map((t,) => rowCount(db, t,));
  const sum = counts.reduce((a, b,) => a + b, 0,);
  const map = new Map<string, number>();
  if (sum === 0) { return map; }
  for (let i = 0; i < tables.length; i++) {
    map.set(tables[i]!, Math.round(total * counts[i]! / sum,),);
  }
  return map;
}

/** Human-readable byte count, stable layout. */
function fmtBytes(n: number,): string {
  if (n < 1024) { return `${n} B`; }
  const units = ["B", "KiB", "MiB", "GiB", "TiB",] as const;
  let v = n;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(1,)} ${units[u]}`;
}

/** Build the sorted, deterministic report against a read-only connection. */
function buildReport(dbPath: string,): GrowthReport {
  const db = new Database(dbPath, { readonly: true, },);
  try {
    const tables = listTables(db,);
    const source = hasDbstat(db,) ? "dbstat" : "pageEstimate";
    const bytes = source === "dbstat"
      ? bytesViaDbstat(db,)
      : bytesViaPageEstimate(db, tables,);
    const report: TableReport[] = tables.map((t,) => {
      const b = bytes.get(t,) ?? 0;
      return { table: t, rows: rowCount(db, t,), bytes: b, bytesHuman: fmtBytes(b,), };
    },);
    report.sort((a, b,) => a.table.localeCompare(b.table,));
    return { dbPath, source, tables: report, };
  } finally {
    db.close();
  }
}

/** Render the fixed-width text table. */
function renderTable(report: GrowthReport,): void {
  console.log(`database: ${report.dbPath}`,);
  console.log(`bytes source: ${report.source}`,);
  const nameW = Math.max("table".length, ...report.tables.map((t,) => t.table.length),);
  const rowsW = Math.max("rows".length, ...report.tables.map((t,) => String(t.rows,).length),);
  const bytesW = Math.max("bytes".length, ...report.tables.map((t,) => t.bytesHuman.length),);
  const header = `${"table".padEnd(nameW,)}  ${"rows".padStart(rowsW,)}  ${"bytes".padStart(bytesW,)}`;
  console.log(header,);
  console.log("-".repeat(header.length,),);
  for (const t of report.tables) {
    console.log(
      `${t.table.padEnd(nameW,)}  ${String(t.rows,).padStart(rowsW,)}  ${t.bytesHuman.padStart(bytesW,)}`,
    );
  }
}

if (import.meta.main) {
  const dbPath = resolveDbPath();
  if (!Bun.file(dbPath,).exists()) {
    console.error(`ERROR: database not found at ${dbPath}`,);
    process.exit(1,);
  }
  const report = buildReport(dbPath,);
  if (process.argv.includes("--json",)) {
    console.log(JSON.stringify(report, null, 2,),);
  } else {
    renderTable(report,);
  }
}
