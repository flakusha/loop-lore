#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Sync .plan/backlog index files with the tier files they map.
 *
 * The backlog was split 2026-08-15: `priority.md` + `open.md` are now indexes whose
 * "## File map" tables reference per-category tier files (priority-p0-p2.md,
 * priority-p3-p5.md, priority-p6.md, priority-release-010.md / open-inflight.md,
 * open-debt.md, open-deferred.md, open-closed.md). Tier files hold the detail; the
 * indexes must always list every tier file (no orphans) and never reference a file
 * that doesn't exist (no phantoms).
 *
 * Reads:
 *   1. .plan/backlog/*.md — every markdown file in the backlog dir
 *   2. index files (priority.md, open.md) — their `## File map` tables
 *
 * Reports:
 *   - Orphan tier files (.md exists, not listed in any index file map)
 *   - Phantom entries (index file map references a .md that doesn't exist)
 *   - Non-backlog files in a file map (map row targets something outside backlog/)
 *
 * Usage:
 *   bun run scripts/sync-backlog-index.ts           # dry-run report
 *   bun run scripts/sync-backlog-index.ts --fix     # add missing rows / drop phantoms
 *   bun run scripts/sync-backlog-index.ts --verbose # show file-map state
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, } from "node:fs";
import { join, } from "node:path";

// ── Config ─────────────────────────────────────────────────────

const ROOT = process.cwd();
const BACKLOG_DIR = join(ROOT, ".plan/backlog",);
const INDEX_FILES = ["priority.md", "open.md",]; // index docs that carry a file map

// ── File map parsing ───────────────────────────────────────────

interface FileMapRow {
  line: number;
  target: string; // file path as written (e.g. "./priority-p0-p2.md" or "priority-p0-p2.md")
  file: string; // resolved basename
}

/**
 * Parse `| [`name.md`](./name.md) | description |` rows from a file map table.
 * Recognizes both `./file.md` and bare `file.md` link targets.
 */
function parseFileMap(filePath: string,): FileMapRow[] {
  const lines = readFileSync(filePath, "utf8",).split("\n",);
  const rows: FileMapRow[] = [];

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const m = l.match(/^\|\s*\[`([^`]+)`\]\((\.\/)?([^)]+\.md)\)\s*\|/,);
    if (!m) { continue; }
    rows.push({ line: i + 1, target: m[2] === "./" ? `./${m[3]}` : m[3]!, file: m[3]!, },);
  }
  return rows;
}

// ── Core reconciliation ────────────────────────────────────────

interface SyncResult {
  orphans: string[]; // tier files not listed in any index
  phantoms: Array<{ index: string; row: FileMapRow }>; // map rows with missing files
  outside: Array<{ index: string; row: FileMapRow }>; // map rows pointing outside backlog/
  map: Map<string, Array<{ index: string; row: FileMapRow }>>; // file → index rows
}

function reconcile(): SyncResult {
  const files = readdirSync(BACKLOG_DIR,).filter((f,) => f.endsWith(".md",)).sort();
  const map = new Map<string, Array<{ index: string; row: FileMapRow }>>();
  const phantoms: SyncResult["phantoms"] = [];
  const outside: SyncResult["outside"] = [];

  for (const idx of INDEX_FILES) {
    const indexPath = join(BACKLOG_DIR, idx,);
    if (!existsSync(indexPath,)) { continue; }
    for (const row of parseFileMap(indexPath,)) {
      if (row.file.includes("/",) || row.file === idx || row.file.startsWith("..",)) {
        outside.push({ index: idx, row, },);
        continue;
      }
      const entry = { index: idx, row, };
      const existing = map.get(row.file,) ?? [];
      existing.push(entry,);
      map.set(row.file, existing,);
      if (!files.includes(row.file,)) {
        phantoms.push({ index: idx, row, },);
      }
    }
  }

  const listed = new Set(map.keys(),);
  const orphans = files.filter((f,) => f !== "priority.md" && f !== "open.md" && !listed.has(f,));

  return { orphans, phantoms, outside, map, };
}

// ── Reporting ──────────────────────────────────────────────────

function report(result: SyncResult, verbose: boolean,): void {
  console.log("\n📊 Reconcile .plan/backlog indexes...\n",);
  console.log(`   Backlog .md files:   ${readdirSync(BACKLOG_DIR,).filter((f,) => f.endsWith(".md",)).length}`,);
  console.log(`   Index files:         ${INDEX_FILES.join(", ",)}`,);

  console.log("\n📋 Reconciliation Report\n" + "─".repeat(60,),);

  if (result.orphans.length > 0) {
    console.log(`\n🔴 Orphan files (not in any index file map): ${result.orphans.length}`,);
    for (const f of result.orphans) { console.log(`   ${f}`,); }
  } else {
    console.log("\n🟢 No orphan files",);
  }

  if (result.phantoms.length > 0) {
    console.log(`\n🔴 Phantom entries (index maps missing file): ${result.phantoms.length}`,);
    for (const p of result.phantoms) {
      console.log(`   ${p.index}:${p.row.line} → ${p.row.file} (missing)`,);
    }
  } else {
    console.log("\n🟢 No phantom entries",);
  }

  if (result.outside.length > 0) {
    console.log(`\n🟡 Non-backlog file-map targets: ${result.outside.length}`,);
    for (const o of result.outside) {
      console.log(`   ${o.index}:${o.row.line} → ${o.row.target}`,);
    }
  } else {
    console.log("\n🟢 No outside targets",);
  }

  if (verbose) {
    console.log("\n🗂️  File map state:",);
    for (const [file, rows,] of [...result.map.entries(),].sort()) {
      const homes = rows.map((r,) => r.index).join(", ",);
      const dup = rows.length > 1 ? " ⚠️ multiple homes" : "";
      console.log(`   ${file.padEnd(28,)} ← ${homes}${dup}`,);
    }
    const listed = [...result.map.keys(),].filter((f,) => !result.orphans.includes(f,));
    const unlisted = result.orphans;
    console.log(`\n   Listed: ${listed.length} · Unlisted (orphans): ${unlisted.length}`,);
  }

  const issues = result.orphans.length + result.phantoms.length + result.outside.length;
  console.log("\n" + "═".repeat(60,),);
  if (issues === 0) {
    console.log("✅ Backlog indexes are in sync",);
    process.exit(0,);
  } else {
    console.log(`⚠️  ${issues} actionable issue(s) found`,);
    console.log("Run with --fix to apply automatic fixes",);
    process.exit(1,);
  }
}

// ── Fixing ─────────────────────────────────────────────────────

const MAP_ROW = (file: string,): string => `| [\`${file}\`](./${file}) | TODO — add description |`;

/**
 * Insert a missing file-map row under the `## File map` table of an index.
 * Appends after the last `|` row of the first file-map table found.
 */
function addMapRow(index: string, file: string,): boolean {
  const path = join(BACKLOG_DIR, index,);
  if (!existsSync(path,)) { return false; }
  const lines = readFileSync(path, "utf8",).split("\n",);
  let inMap = false;
  let insertAt = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.startsWith("## File map",)) {
      inMap = true;
      continue;
    }
    if (inMap && lines[i]!.startsWith("## ",)) { break; } // next section
    if (inMap && lines[i]!.startsWith("|",) && !lines[i]!.startsWith("| ---",)) {
      insertAt = i; // last table row seen
    }
  }
  if (insertAt < 0) { return false; }

  lines.splice(insertAt + 1, 0, MAP_ROW(file,),);
  writeFileSync(path, lines.join("\n",),);
  return true;
}

function dropPhantomRow(index: string, row: FileMapRow,): boolean {
  const path = join(BACKLOG_DIR, index,);
  if (!existsSync(path,)) { return false; }
  const lines = readFileSync(path, "utf8",).split("\n",);
  const idx = row.line - 1;
  if (idx < 0 || idx >= lines.length) { return false; }
  lines.splice(idx, 1,);
  writeFileSync(path, lines.join("\n",),);
  return true;
}

function applyFixes(result: SyncResult,): void {
  console.log("\n🔧 Applying fixes...\n",);
  let changed = false;

  for (const f of result.orphans) {
    // Prefer the index whose naming convention matches: open-*.md → open.md,
    // priority-*.md → priority.md; fall back to priority.md.
    const targetIndex = f.startsWith("open-",) ? "open.md" : "priority.md";
    if (addMapRow(targetIndex, f,)) {
      console.log(`   ${f}: added to ${targetIndex} file map`,);
      changed = true;
    }
  }

  for (const p of result.phantoms) {
    if (dropPhantomRow(p.index, p.row,)) {
      console.log(`   ${p.index}:${p.row.line}: dropped phantom row (${p.row.file})`,);
      changed = true;
    }
  }

  // Outside targets: report only (can't auto-fix — likely an intentional cross-doc link)
  for (const o of result.outside) {
    console.log(`   ${o.index}:${o.row.line}: outside target ${o.row.target} — manual review`,);
  }

  if (!changed) {
    console.log("   Nothing to fix",);
  } else {
    console.log("\n✅ Wrote index file(s). Re-run without --fix to verify.",);
  }
}

// ── Main ───────────────────────────────────────────────────────

const fix = process.argv.includes("--fix",);
const verbose = process.argv.includes("--verbose",);

const result = reconcile();
if (fix) {
  applyFixes(result,);
  // Re-report to show residual issues after fixes
  console.log("\nRe-running reconcile after fixes:",);
  report(reconcile(), verbose,);
} else {
  report(result, verbose,);
}
