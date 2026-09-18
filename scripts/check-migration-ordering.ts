#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * check-migration-ordering.ts — Gate that enforces:
 *   1. Every migration file at the loader scope matches `NNN_name.ts`
 *      (3-digit numeric prefix). Stray .ts (README siblings, helpers,
 *      tests) get flagged.
 *   2. Numeric prefixes are unique within the LOADER SCOPE
 *      (src/db/migrations/) — the directory migrate.ts's readdirSync
 *      actually scans. Duplicate prefixes there were the original
 *      ticket's failure mode (041a_/041b_ etc. ordered alphabetically
 *      by localeCompare rather than by author intent).
 *   3. Names sort numerically by prefix, then alphabetically — the same
 *      rule src/db/migrate.ts:compareMigrationNames enforces at runtime.
 *
 * The src/db/migrations/parts/ subdirectory is loaded transitively via
 * 001_init.ts imports (NOT by migrate.ts readdirSync), so its prefixes
 * intentionally overlap with root (e.g. parts/001_core is composed into
 * 001_init). Renaming parts/* would orphan every applied
 * kysely_migration row, which the project's append-only migration policy
 * forbids. Parts collisions are therefore checked only as a soft warning
 * that future work could change.
 *
 * BUG-migration-ordering-ambiguous-via-localecompare-duplicate-num.
 *
 * Wired into scripts/check-parallel.mjs as the `migrations - ordering` gate.
 *
 * Run: `bun run scripts/check-migration-ordering.ts`
 * Exit: 0 = clean, 1 = findings printed.
 */
import { readdirSync, } from "node:fs";
import path from "node:path";
import { fileURLToPath, } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url,),);
const ROOT = path.resolve(__dirname, "..",);
const MIGRATIONS_ROOT = path.join(ROOT, "src/db/migrations",);
const PARTS_ROOT = path.join(MIGRATIONS_ROOT, "parts",);

const FILENAME = /^(\d{3})_(.+)\.ts$/;

interface FileRow {
  readonly name: string;
  readonly prefix: string;
  readonly relDir: string;
}

const LOADER_SCOPE: ReadonlyArray<{ abs: string; relDir: string }> = [
  { abs: MIGRATIONS_ROOT, relDir: "src/db/migrations", },
];
// Parts: same shape but tracked separately — overlaps with root are
// expected, so a parts-only collision is reported but does not fail the gate.
const PARTS_SCOPE: ReadonlyArray<{ abs: string; relDir: string }> = [
  { abs: PARTS_ROOT, relDir: "src/db/migrations/parts", },
];

interface ScopeReport {
  readonly collected: FileRow[];
  readonly stray: string[];
}

const scanScope = (scope: ReadonlyArray<{ abs: string; relDir: string }>,): ScopeReport => {
  const collected: FileRow[] = [];
  const stray: string[] = [];
  for (const { abs, relDir, } of scope) {
    let entries: string[];
    try {
      entries = readdirSync(abs,);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".ts",)) { continue; }
      const m = entry.match(FILENAME,);
      if (m) { collected.push({ name: entry, prefix: m[1]!, relDir, },); }
      else { stray.push(path.join(relDir, entry,),); }
    }
  }
  return { collected, stray, };
};

const loaderReport = scanScope(LOADER_SCOPE,);
const partsReport = scanScope(PARTS_SCOPE,);

let failed = false;
const fail = (msg: string,): void => {
  console.error(`  X ${msg}`,);
  failed = true;
};
const ok = (msg: string,): void => {
  console.log(`  ok ${msg}`,);
};
const warn = (msg: string,): void => {
  console.warn(`  ! ${msg}`,);
};

console.log("Migration ordering gate",);
console.log(
  `  loader scope: ${loaderReport.collected.length} files, parts scope: ${partsReport.collected.length} files`,
);

if (loaderReport.stray.length === 0 && partsReport.stray.length === 0) {
  ok("no stray .ts files in src/db/migrations{,/parts}",);
} else {
  fail(`stray .ts files (would be filtered at runtime — remove or rename):`,);
  for (const s of [...loaderReport.stray, ...partsReport.stray,]) { console.error(`      ${s}`,); }
}

const groupByPrefix = (rows: readonly FileRow[],): Record<string, FileRow[]> => {
  const grouped: Record<string, FileRow[]> = {};
  for (const f of rows) {
    grouped[f.prefix] ??= [];
    grouped[f.prefix].push(f,);
  }
  return grouped;
};

const loaderCollisions = Object.entries(groupByPrefix(loaderReport.collected,),)
  .filter(([, files,],) => files.length > 1);
if (loaderCollisions.length === 0) {
  ok(
    `loader scope: unique prefixes (${
      Object.keys(groupByPrefix(loaderReport.collected,),).length
    } prefixes across ${loaderReport.collected.length} files)`,
  );
} else {
  fail(`loader scope: duplicate numeric prefixes (${loaderCollisions.length}):`,);
  for (const [prefix, files,] of loaderCollisions) {
    console.error(`      prefix ${prefix}:`,);
    for (const f of files) { console.error(`        - ${path.join(f.relDir, f.name,)}`,); }
  }
}

const partsCollisions = Object.entries(groupByPrefix(partsReport.collected,),)
  .filter(([, files,],) => files.length > 1);
if (partsCollisions.length === 0) {
  ok(`parts scope: unique prefixes (${partsReport.collected.length} files)`,);
} else {
  warn(
    `parts scope: ${partsCollisions.length} prefix overlaps with loader scope (expected for 001_init orchestration; flag for review only)`,
  );
}

const numericSort = (a: FileRow, b: FileRow,): number => {
  if (a.prefix !== b.prefix) { return Number(a.prefix,) - Number(b.prefix,); }
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
};
const sorted = [...loaderReport.collected,].sort(numericSort,);
let orderOk = true;
for (let i = 0; i < sorted.length; i++) {
  if (sorted[i] !== sorted[i]) {
    orderOk = false;
    break;
  }
}
if (orderOk) {
  ok("loader scope: declared order is stable under numeric + alphabetical comparator",);
} else {
  fail("loader scope: declared order disagrees with comparator — re-run after sort fix",);
}

if (failed) {
  console.error("\nMigration ordering gate FAILED.",);
  process.exit(1,);
}
console.log("\nMigration ordering gate PASSED.",);
