#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 280

/**
 * Normalize `.plan` status values onto their closed vocabularies.
 *
 * `.plan/` has two status vocabularies that were never reconciled:
 *
 *  - PLAN (`giwt plan validate status-vocab`, STATUS_ENUM), validated on
 *    ticket/epic `.md` headers: Not Started | In Progress | Blocked | Done |
 *    Wontfix | Postponed.
 *  - MATRIX (`giwt plan matrix`, STATUS_COLUMNS), stored per-entry in
 *    `.plan/tickets/index.json` and classified by `normalizeStatus`:
 *    done | in_progress | open | draft | cancelled | other.
 *
 * The index writer stores `normalizeStatus(tf.status)`, and `normalizeStatus`
 * RETURNS ITS INPUT VERBATIM for anything outside its regex classes ("⬜ Not
 * Started", "Not Started", "undefined", "Proposed" all pass through). Those
 * values froze into the index, the status-vocab gate never reads the index, and
 * `.plan/feature-matrix.md` bucketed 648 of 3286 tickets under `other` — 368 of
 * them the exact same state as 240 others written as bare "Not Started".
 *
 * This script repairs both sides:
 *
 *  1. Epic `.md` headers — off-vocabulary values (Draft, Proposed) rewrite to
 *     the canonical enum via giwt.toml's existing `[status.aliases]`.
 *  2. `index.json` statuses — values `normalizeStatus` classifies natively are
 *     a fixed point and are LEFT ALONE; only its pass-through leftovers
 *     collapse into the matrix column their plan-vocabulary meaning implies.
 *
 * Meaning is never altered: "Not Started" becomes "open" — the column it always
 * belonged to. Nothing is opened or closed. Values resolving to neither
 * vocabulary are reported, never guessed.
 *
 * Idempotent — a second run rewrites nothing. `--check` reports without
 * writing and exits 1 when drift remains.
 *
 * Usage: `bun run plan:status:normalize [--check]`
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, } from "node:fs";
import { join, } from "node:path";

// `resolveStatus` / `normalizeStatus` are NOT in giwt's public API (its package
// exports map has no subpaths), so they are reached by path until giwt exports
// them. `loadSettings` IS public and is imported normally.
import { loadSettings, } from "giwt";
import { resolveStatus, } from "../../node_modules/giwt/src/plan/status-vocab";
import { normalizeStatus, } from "../../node_modules/giwt/src/tickets/sync-normalize";

const ROOT = join(import.meta.dir, "..", "..",);
const EPICS_DIR = join(ROOT, ".plan", "epics",);
const INDEX_PATH = join(ROOT, ".plan", "tickets", "index.json",);
const ALIASES = loadSettings(ROOT,).status.aliases;

/** Matrix columns, in the order `giwt plan matrix` emits them. */
const MATRIX_COLUMNS = ["done", "in_progress", "open", "draft", "cancelled", "other",] as const;

/**
 * Canonical plan status -> the matrix column that holds it.
 *
 * `normalizeStatus` recognises "done" and "in progress" but passes "Not
 * Started", "Blocked", "Wontfix" and "Postponed" through verbatim, so without
 * this bridge four of the six enum values would land in `other`. Blocked and
 * Postponed are open-but-not-started work; Wontfix is the dropped class, which
 * the matrix spells "cancelled".
 */
const PLAN_TO_MATRIX: Record<string, string> = {
  "Not Started": "open",
  "In Progress": "in_progress",
  "Blocked": "open",
  "Done": "done",
  "Wontfix": "cancelled",
  "Postponed": "open",
};

/** Mirrors giwt's `scanHeaderStatusLines` (first 30 lines, fenced blocks skipped). */
const STATUS_LINE_PARTS_RE =
  /^(\s*(?:[-*>]\s*)?(?:\*\*)?\s*status\s*(?:\*\*)?\s*[:=]\s*(?:\*\*)?\s*)(.+?)(\s*(?:\*\*)?\s*)$/i;
const HEADER_LINES = 30;

interface StatusLine {
  /** 0-based index of the line. */
  line: number;
  text: string;
  value: string;
  /** Index of `value` inside `text`. */
  start: number;
}

function scanHeaderStatusLines(path: string,): StatusLine[] {
  const out: StatusLine[] = [];
  let fenced = false;
  const lines = readFileSync(path, "utf8",).split("\n",).slice(0, HEADER_LINES,);
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i] ?? "";
    if (/^\s*(```|~~~)/.test(text,)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) { continue; }
    const m = STATUS_LINE_PARTS_RE.exec(text,);
    if (!m) { continue; }
    out.push({ line: i, text, value: m[2] ?? "", start: m.index + (m[1] ?? "").length, },);
  }
  return out;
}

type Tally = Map<string, number>;
/** Which feature-matrix column an index status value lands in. */
function bucketOf(value: string,): string {
  const n = normalizeStatus(value,);
  return (MATRIX_COLUMNS as readonly string[]).includes(n,) ? n : "other";
}

/** Rewrite a status line's value span, keeping the `**Status:**` decoration. */
function spliceValue(line: StatusLine, canonical: string,): string {
  const before = line.text.slice(0, line.start,);
  const after = line.text.slice(line.start + line.value.length,);
  return `${before}${canonical}${after}`;
}

// ─── Epic .md headers ─────────────────────────────────────────────────────────

/**
 * Only the FIRST status line in an epic is header metadata — later ones are
 * per-section prose annotations ("**Status:** ✅ Phase 1 Complete") that
 * describe a subsection, not the epic.
 */
function normalizeEpics(check: boolean,): Tally {
  const tally: Tally = new Map();
  if (!existsSync(EPICS_DIR,)) { return tally; }
  for (const file of readdirSync(EPICS_DIR,).sort()) {
    if (!file.endsWith(".md",)) { continue; }
    const path = join(EPICS_DIR, file,);
    const head = scanHeaderStatusLines(path,)[0];
    if (!head) { continue; }
    const raw = head.value.trim();
    const { value, action, } = resolveStatus(raw, ALIASES,);
    if (action === "valid") { continue; }
    if (action === "invalid") {
      const label = `INVALID ${JSON.stringify(raw,)}  (${file} — needs a human call)`;
      tally.set(label, (tally.get(label,) ?? 0) + 1,);
      continue;
    }
    const label = `${JSON.stringify(raw,)} -> ${JSON.stringify(value,)}`;
    tally.set(label, (tally.get(label,) ?? 0) + 1,);
    if (check) { continue; }
    const lines = readFileSync(path, "utf8",).split("\n",);
    lines[head.line] = spliceValue(head, value,);
    writeFileSync(path, lines.join("\n",),);
  }
  return tally;
}

// ─── Ticket index ─────────────────────────────────────────────────────────────

interface IndexEntry {
  status?: string;
  [k: string]: unknown;
}

/**
 * The matrix column a pass-through index status belongs in, or null when it
 * resolves to neither vocabulary and needs a human decision.
 *
 * `resolveStatus` preserves trailing annotations ("Planned (this bundle)" ->
 * "Not Started (this bundle)"), which cannot key the plan enum directly — so
 * the bridge reads the CORE, before any parenthetical. Valid canonical values
 * and rewritten aliases arrive here alike; only the enum needs the bridge,
 * since `bucketOf` already recognises "done" and "in_progress" directly.
 */
function matrixTargetFor(raw: string,): string | null {
  const { value, action, } = resolveStatus(raw, ALIASES,);
  if (action === "invalid") { return null; }
  const core = value.replace(/\s*\([^)]*\)\s*$/s, "",).trim();
  return PLAN_TO_MATRIX[core] ?? bucketOf(value,);
}

interface IndexResult {
  /** Values this run would rewrite (or did rewrite). */
  changes: Tally;
  /** Values neither vocabulary claims — reported, never guessed. */
  unresolved: Tally;
  /** Projected feature-matrix column totals. */
  columns: string[];
}

function normalizeIndex(check: boolean,): IndexResult {
  const changes: Tally = new Map();
  const unresolved: Tally = new Map();
  if (!existsSync(INDEX_PATH,)) { return { changes, unresolved, columns: [], }; }

  const index = JSON.parse(readFileSync(INDEX_PATH, "utf8",),) as Record<string, IndexEntry>;
  const counts: Record<string, number> = {};
  let dirty = false;

  for (const [extid, entry,] of Object.entries(index,)) {
    const current = entry.status ?? "undefined";
    const bucket = bucketOf(current,);

    // A value `normalizeStatus` already classifies is a fixed point. Leave it
    // alone: this must never reopen a `done` ticket or close an `open` one.
    if (bucket !== "other") {
      counts[bucket] = (counts[bucket] ?? 0) + 1;
      continue;
    }

    const target = matrixTargetFor(current,);
    if (target === null) {
      unresolved.set(current, (unresolved.get(current,) ?? 0) + 1,);
      counts[bucket] = (counts[bucket] ?? 0) + 1;
      continue;
    }
    counts[target] = (counts[target] ?? 0) + 1;
    if (target === current) { continue; }
    const label = `${JSON.stringify(current,)} -> ${JSON.stringify(target,)}`;
    changes.set(label, (changes.get(label,) ?? 0) + 1,);
    if (check) { continue; }
    index[extid] = { ...entry, status: target, };
    dirty = true;
  }

  if (dirty && !check) {
    // Preserve giwt's extid sort so the file matches `giwt sync --fix` output.
    const sorted = Object.fromEntries(Object.entries(index,).sort(([a,], [b,],) => a.localeCompare(b,)),);
    writeFileSync(INDEX_PATH, `${JSON.stringify(sorted, null, 2,)}\n`,);
  }

  return {
    changes,
    unresolved,
    columns: MATRIX_COLUMNS.map((c,) => `  ${c.padEnd(12,)} ${String(counts[c] ?? 0,).padStart(5,)}`),
  };
}

// ─── Report ───────────────────────────────────────────────────────────────────

function report(title: string, tally: Tally, note = "",): void {
  console.log(`\n${title}`,);
  if (tally.size === 0) {
    console.log("  (nothing to do — already canonical)",);
    return;
  }
  for (const [k, n,] of [...tally,].sort((a, b,) => b[1] - a[1] || a[0].localeCompare(b[0],))) {
    console.log(`  ${String(n,).padStart(5,)}  ${k.length > 112 ? `${k.slice(0, 109,)}...` : k}`,);
  }
  console.log(`  ${"-".repeat(66,)}\n  total: ${[...tally.values(),].reduce((a, b,) => a + b, 0,)}${note}`,);
}

const check = process.argv.includes("--check",);
console.log(`plan status normalize — ${check ? "check only" : "applying"} (root: ${ROOT})`,);

const epics = normalizeEpics(check,);
const index = normalizeIndex(check,);

report("=== EPIC headers (.plan/epics/*.md) ===", epics,);
report("=== TICKET index (.plan/tickets/index.json) ===", index.changes,);
report(
  "=== UNRESOLVED — in neither vocabulary, left untouched ===",
  index.unresolved,
  "\n  add a [status.aliases] entry in giwt.toml to settle these",
);
if (index.columns.length > 0) {
  console.log("\n=== feature-matrix columns after this run ===\n" + index.columns.join("\n",),);
}
console.log(
  check
    ? "\n--check: exit 1 means the values above would change."
    : "\ndone. Regenerate the derived artifacts: bun run plan:docs && bun run plan:matrix",
);
// Only an actionable rewrite is drift; UNRESOLVED values are a standing human
// decision, not something this script can converge on, so they must not make
// --check permanently red.
const drift = [...epics.values(), ...index.changes.values(),].some((n,) => n > 0);
process.exit(check && drift ? 1 : 0,);
