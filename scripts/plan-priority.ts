// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Priority matrix — deterministic projection of the ticket index + epics.
 *
 * The hand-maintained `.plan/backlog` tier files were dropped (2026-11-01);
 * priority/order is now a GENERATED view derived from `.plan/tickets/index.json`
 * (per-ticket `**Priority:**` + status frontmatter) and `.plan/epics/*.md`
 * (per-epic `**Priority:**`/`**Status:**`). This script renders
 * `.plan/priority-matrix.md`: priority × status tables plus the open
 * workstack per priority bucket.
 *
 * Reuses the pinned giwt machinery the `plan - matrix` gate already trusts:
 * the ticket index is read through the same `readTicketIndex` reader
 * `giwt plan matrix` uses (index-stamp guard included), statuses bucket
 * through the same `normalizeStatus` vocabulary, and the file carries the
 * REUSE-derived SPDX header via `generatedHeader` — so the view cannot
 * drift from the index format without the existing gates noticing.
 *
 * Like `generateMatrixMarkdown`, rendering is pure and timestamp-free:
 * byte-identical output for identical inputs, so `--check` is exact
 * string equality (epics-doc gate precedent).
 *
 * Usage:
 *   bun run plan:priority          # regenerate .plan/priority-matrix.md
 *   bun run plan:priority --check  # verify the committed copy is fresh
 */

import { existsSync, readFileSync, writeFileSync, } from "node:fs";
import { join, } from "node:path";
// Deep-path imports of the pinned giwt (idiom: scripts/check/parallel/gpg.mjs).
import { readTicketIndex, } from "../node_modules/giwt/src/plan/feature-matrix";
import { collectEpics, } from "../node_modules/giwt/src/plan/gen-docs";
import type { Epic, } from "../node_modules/giwt/src/plan/gen-docs";
import { normalizeStatus, } from "../node_modules/giwt/src/tickets/sync-ticket";
import type { IndexEntry, } from "../node_modules/giwt/src/tickets/sync-ticket-types";
import { generatedHeader, } from "../node_modules/giwt/src/utils/reuse-toml";

const ROOT = import.meta.dir + "/..";
const OUT_PATH = join(ROOT, ".plan", "priority-matrix.md",);
const INDEX_PATH = join(ROOT, ".plan", "tickets", "index.json",);
const EPICS_DIR = join(ROOT, ".plan", "epics",);

/** Status columns, mirroring the feature matrix's fixed bucket order. */
const STATUS_COLUMNS = ["done", "in_progress", "open", "draft", "cancelled", "other",] as const;
type StatusBucket = (typeof STATUS_COLUMNS)[number];

/** Priority buckets in workstack order; unmapped freeform values land last. */
const PRIORITY_BUCKETS = ["Critical", "High", "Medium", "Low", "(unprioritized)",] as const;
type PriorityBucket = (typeof PRIORITY_BUCKETS)[number];

/**
 * Canonicalize a frontmatter priority (`High`, `medium`, `P2 — Medium`,
 * `P0 — Critical`, `Medium-High`, …) into one of PRIORITY_BUCKETS.
 * The ladder token wins (P0→Critical … P3+→Low); otherwise the leading
 * severity word matches case-insensitively; anything else is unprioritized.
 */
function normalizePriority(raw: string | undefined,): PriorityBucket {
  const s = (raw ?? "").trim().toLowerCase();
  const ladder = s.match(/^p(\d)/,);
  if (ladder) {
    const n = Number(ladder[1],);
    if (n === 0) { return "Critical"; }
    if (n === 1) { return "High"; }
    if (n === 2) { return "Medium"; }
    return "Low";
  }
  if (s.startsWith("critical",)) { return "Critical"; }
  if (s.startsWith("high",)) { return "High"; }
  if (s.startsWith("medium",)) { return "Medium"; }
  if (s.startsWith("low",)) { return "Low"; }
  return "(unprioritized)";
}

/**
 * One of the STATUS_COLUMNS, or "other" for freeform passthrough values.
 *
 * Local bridge: normalizeStatus passes "Not Started" through as freeform, so
 * those entries (~530 across tickets + epics) land in `other` and undercount
 * the open workstack. Pre-map them to "open" until the pinned giwt handles
 * the vocabulary.
 * TODO(upstream): remove when pinned giwt normalizeStatus classifies
 * "Not Started" (upstream giwt ticket pending).
 */
function bucketOf(status: string | undefined,): StatusBucket {
  const raw = status ?? "";
  const bridged = /\bnot[- ]started\b/i.test(raw,) ? "open" : raw;
  const s = normalizeStatus(bridged || "undefined",);
  return STATUS_COLUMNS.find((c,) => c === s) ?? "other";
}

interface BucketRow {
  key: PriorityBucket;
  total: number;
  statuses: Record<StatusBucket, number>;
  /** Open + in-progress ids, extid-sorted — the actionable workstack. */
  actionable: string[];
}

function emptyStatuses(): Record<StatusBucket, number> {
  return { done: 0, in_progress: 0, open: 0, draft: 0, cancelled: 0, other: 0, };
}

function rowFor(rows: Map<PriorityBucket, BucketRow>, key: PriorityBucket,): BucketRow {
  let row = rows.get(key,);
  if (!row) {
    row = { key, total: 0, statuses: emptyStatuses(), actionable: [], };
    rows.set(key, row,);
  }
  return row;
}

interface Projected {
  id: string;
  priority: PriorityBucket;
  bucket: StatusBucket;
}

/** Pure projection: fixed-order per-priority rows from id/priority/status triples. */
function buildRows(items: Projected[],): BucketRow[] {
  const rows = new Map<PriorityBucket, BucketRow>();
  for (const { id, priority, bucket, } of items) {
    const row = rowFor(rows, priority,);
    row.total++;
    row.statuses[bucket]++;
    if (bucket === "open" || bucket === "in_progress") { row.actionable.push(id,); }
  }
  for (const row of rows.values()) { row.actionable.sort((a, b,) => a.localeCompare(b,)); }
  return PRIORITY_BUCKETS.map((p,) => rows.get(p,) ?? { key: p, total: 0, statuses: emptyStatuses(), actionable: [], });
}

function projectTickets(entries: Record<string, IndexEntry>,): Projected[] {
  return Object.keys(entries,).sort().map((extid,) => {
    const e = entries[extid]!;
    return { id: extid, priority: normalizePriority(e.priority,), bucket: bucketOf(e.status,), };
  },);
}

function projectEpics(epics: Epic[],): Projected[] {
  return [...epics,]
    .sort((a, b,) => a.file.localeCompare(b.file,))
    .map((e,) => ({
      id: e.file.replace(/\.md$/, "",),
      priority: normalizePriority(e.priority,),
      bucket: bucketOf(e.status,),
    }));
}

function statusTable(title: string, rows: BucketRow[],): string[] {
  const lines = [
    `## ${title}`,
    "",
    `| Priority | Total | ${STATUS_COLUMNS.join(" | ",)} |`,
    `| --- | ---: | ${STATUS_COLUMNS.map(() => "---:").join(" | ",)} |`,
  ];
  for (const r of rows) {
    const cells = STATUS_COLUMNS.map((c,) => r.statuses[c]);
    lines.push(`| ${r.key} | ${r.total} | ${cells.join(" | ",)} |`,);
  }
  return lines;
}

/** Open workstack: open + in-progress ids per bucket, highest priority first. */
function openWorkstack(rows: BucketRow[],): string[] {
  const lines = ["## Open workstack by priority", "",];
  for (const r of rows) {
    lines.push(`### ${r.key}`, "",);
    if (r.actionable.length === 0) {
      lines.push("(none)", "",);
    } else {
      lines.push(r.actionable.map((id,) => `\`${id}\``).join(", ",), "",);
    }
  }
  return lines;
}

/** Pure markdown rendering — byte-identical output for identical inputs. */
function render(ticketRows: BucketRow[], epicRows: BucketRow[], total: number,): string {
  const lines = [
    generatedHeader(OUT_PATH, ".md",).replace(/\n$/, "",),
    "",
    "<!-- Do not edit manually — regenerate with `bun run plan:priority` -->",
    "",
    "# Priority matrix",
    "",
    `Total tickets: **${total}** — derived from \`.plan/tickets/index.json\` + \`.plan/epics/*.md\` frontmatter.`,
    "Replaces the hand-maintained backlog tier files (dropped 2026-11-01);",
    "historical content archived in `.plan/backlog-archive.md`.",
    "",
    ...statusTable("Tickets by priority × status", ticketRows,),
    "",
    ...statusTable("Epics by priority × status", epicRows,),
    "",
    ...openWorkstack(ticketRows,),
  ];
  return lines.join("\n",);
}

function currentOutput(): string {
  const entries = readTicketIndex(INDEX_PATH,);
  const ticketRows = buildRows(projectTickets(entries,),);
  const epicRows = buildRows(projectEpics(collectEpics(EPICS_DIR,),),);
  return render(ticketRows, epicRows, Object.keys(entries,).length,);
}

const check = process.argv.includes("--check",);
const fresh = currentOutput();

if (check) {
  if (!existsSync(OUT_PATH,)) {
    console.error(".plan/priority-matrix.md is missing — run `bun run plan:priority` to generate",);
    process.exit(1,);
  }
  const committed = readFileSync(OUT_PATH, "utf8",);
  if (committed !== fresh) {
    console.error(".plan/priority-matrix.md is stale — run `bun run plan:priority` to regenerate",);
    process.exit(1,);
  }
  console.log("ok .plan/priority-matrix.md is fresh",);
} else {
  writeFileSync(OUT_PATH, fresh,);
  console.log("wrote .plan/priority-matrix.md",);
}
