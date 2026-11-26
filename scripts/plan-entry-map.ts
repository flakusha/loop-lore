// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plan entry map — the generated lanes → tickets → epics navigation view.
 *
 * Lanes (`.tmp/intercom/LANE-*.md`, gitignored scratch) claim tickets by
 * free-text token; tickets bind to epics via `**Epic:**` and to the canonical
 * id via filename slug ↔ H1 ↔ index extid. This script renders
 * `.plan/entry-map.md` from those sources plus `tickets/index.json`, so
 * navigation never rots when files move. Like the priority matrix, rendering
 * is pure and timestamp-free: `--check` is exact string equality.
 *
 * Unresolvable lane claims are WARNINGS (many lanes are historical), while
 * filename-slug vs H1 vs index-title drift on lane-scoped tickets is an
 * ERROR — the map records both, the exit code only fails on drift.
 *
 * Usage:
 *   bun run plan:entry-map          # regenerate .plan/entry-map.md
 *   bun run plan:entry-map --check  # verify the committed copy is fresh
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, } from "node:fs";
import { join, } from "node:path";
import { readTicketIndex, } from "../node_modules/giwt/src/plan/feature-matrix";
import { collectEpics, } from "../node_modules/giwt/src/plan/gen-docs";
import { linesOutsideFences, } from "../node_modules/giwt/src/plan/status-vocab";
import { generatedHeader, } from "../node_modules/giwt/src/utils/reuse-toml";

const ROOT = import.meta.dir + "/..";
const TICKETS_DIR = join(ROOT, ".plan", "tickets",);
const EPICS_DIR = join(ROOT, ".plan", "epics",);
const LANES_DIR = join(ROOT, ".tmp", "intercom",);
const OUT_PATH = join(ROOT, ".plan", "entry-map.md",);
const INDEX_PATH = join(TICKETS_DIR, "index.json",);

/** Lane scope this map covers (the doc-schema/md-roundtrip workstack). */
export const LANE_SCOPE = "Implement doc-schema and md-roundtrip tickets; verify installed giwt fixes";

/** Canonicalize for drift comparison: case, hyphens, spaces all fold away. */
export function canon(raw: string | undefined,): string {
  return (raw ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ",).trim().replace(/\s+/g, " ",);
}

/** Strip a leading `TYPE:` / `TYPE-` prefix from an H1 or filename stem. */
export function stripTypePrefix(raw: string,): string {
  return raw.replace(
    /^(?:task|feat|bug|fix|epic|sol|infra|test|perf|wire|improve|idea|spike|chore|docs?)[:\-\s]+/i,
    "",
  ).trim();
}

/** First `**Name:**` value (colon inside or outside the bold) over fence-free lines. */
export function headerField(text: string, name: string,): string | undefined {
  const lines = linesOutsideFences(text.split("\n",),).slice(0, 30,).map((l,) => l.text);
  const re = new RegExp(
    `^\\s*(?:\\*\\*)?${name}\\s*(?:\\*\\*)?\\s*:\\s*(?:\\*\\*)?\\s*(.+?)\\s*(?:\\*\\*)?\\s*$`,
    "i",
  );
  for (const line of lines) {
    const m = line.match(re,);
    if (m?.[1] !== undefined) { return m[1].trim(); }
  }
  return undefined;
}

/** H1 title with the `TYPE:` prefix stripped; falls back to the stem. */
export function h1Title(text: string, stem: string,): string {
  const h1 = text.split("\n",).find((l,) => l.startsWith("# ",));
  if (h1 === undefined) { return stem; }
  return stripTypePrefix(h1.slice(2,),) || stem;
}

const TOKEN_RE =
  /\b((?:TASK|FEAT|BUG|FIX|EPIC|SOL|INFRA|TEST|PERF|WIRE|IMPROVE|IDEA|SPIKE|CHORE|DOCS?)-[A-Za-z0-9][A-Za-z0-9-]*)\b/gi;

/** Ticket tokens claimed by a lane file, deduped in first-seen order. */
export function laneClaims(text: string,): string[] {
  const seen = new Set<string>();
  const body = linesOutsideFences(text.split("\n",),).map((l,) => l.text).join("\n",);
  for (const m of body.matchAll(TOKEN_RE,)) {
    const token = (m[1] ?? "").toUpperCase();
    if (!seen.has(token,)) { seen.add(token,); }
  }
  return [...seen,];
}

export interface ClaimRow {
  token: string;
  file: string | null;
}
export interface LaneRow {
  lane: string;
  claims: ClaimRow[];
}

/**
 * Resolve a claim token to a ticket file: exact slug match first, else a
 * unique prefix match (filenames truncate long slugs). Ambiguous or missing
 * tokens resolve to null — a warning, never an error.
 */
export function resolveClaim(token: string, stems: Map<string, string>,): string | null {
  const upper = token.toUpperCase();
  const exact = stems.get(upper,);
  if (exact !== undefined) { return exact; }
  const prefixed = [...stems.entries(),].filter(([slug,],) => slug.startsWith(upper,));
  return prefixed.length === 1 ? prefixed[0]?.[1] ?? null : null;
}

export interface ScopedTicket {
  file: string;
  title: string;
  status: string;
  epic: string;
  extid: string;
  indexTitle: string | null;
  gitIssue: string | null;
}

export interface LinkageReport {
  lanes: LaneRow[];
  scoped: ScopedTicket[];
  /** file → drift descriptions; empty means the canonical id agrees. */
  drifts: Array<{ file: string; problems: string[] }>;
  warnings: string[];
}

/**
 * Drift between the three canonical-id carriers; [] when they agree.
 * Filename truncation is NOT drift: slugs are capped, so a slug that is a
 * prefix of the H1 (or vice versa) still names the same ticket. Only a
 * genuine divergence — or an H1/index-title mismatch at full length —
 * counts.
 */
export function driftOf(stem: string, h1: string, indexTitle: string | null,): string[] {
  const problems: string[] = [];
  const slug = canon(stripTypePrefix(stem,),);
  const title = canon(h1,);
  if (slug !== title && !title.startsWith(slug,) && !slug.startsWith(title,)) {
    problems.push(`filename slug vs H1 ("${stem}" vs "${h1}")`,);
  }
  if (indexTitle === null) { problems.push("no tickets/index.json entry for this file",); }
  else if (title !== canon(indexTitle,)) { problems.push(`H1 vs index title ("${h1}" vs "${indexTitle}")`,); }
  return problems;
}

/** Pure-over-fs report: lanes, scoped tickets, drift errors, lane warnings. */
export function linkageReport(ticketsDir: string, lanesDir: string, indexPath: string,): LinkageReport {
  const stems = new Map<string, string>();
  for (const name of readdirSync(ticketsDir,).filter((f,) => f.endsWith(".md",)).sort()) {
    stems.set(name.replace(/\.md$/, "",).toUpperCase(), name,);
  }
  let entries: Record<string, { title: string; git_issue?: string }> = {};
  try {
    entries = readTicketIndex(indexPath,) as Record<string, { title: string; git_issue?: string }>;
  } catch {
    entries = {};
  }
  const lanes: LaneRow[] = [];
  const warnings: string[] = [];
  if (existsSync(lanesDir,)) {
    const laneFiles = readdirSync(lanesDir,).filter((f,) => f.startsWith("LANE-",) && f.endsWith(".md",)).sort();
    for (const name of laneFiles) {
      const claims = laneClaims(readFileSync(join(lanesDir, name,), "utf8",),);
      const rows = claims.map((token,) => ({ token, file: resolveClaim(token, stems,), }));
      for (const row of rows.filter((r,) => r.file === null)) {
        warnings.push(`${name}: claim ${row.token} resolves to no ticket file`,);
      }
      lanes.push({ lane: name, claims: rows, },);
    }
  }
  const scoped: ScopedTicket[] = [];
  const drifts: Array<{ file: string; problems: string[] }> = [];
  for (const [, file,] of [...stems.entries(),].sort()) {
    const text = readFileSync(join(ticketsDir, file,), "utf8",);
    if (headerField(text, "Scope",) !== LANE_SCOPE) { continue; }
    const stem = file.replace(/\.md$/, "",);
    const title = h1Title(text, stem,);
    const extid = stem.toUpperCase();
    const entry = entries[extid];
    scoped.push({
      file,
      title,
      extid,
      status: headerField(text, "Status",) ?? "Unknown",
      epic: headerField(text, "Epic",) ?? "",
      indexTitle: entry?.title ?? null,
      gitIssue: entry?.git_issue ?? null,
    },);
    const problems = driftOf(stem, title, entry?.title ?? null,);
    if (problems.length > 0) { drifts.push({ file, problems, },); }
  }
  return { lanes, scoped, drifts, warnings, };
}

function epicFileOf(epic: string,): string {
  const base = epic.split("/",).pop() ?? epic;
  return base.endsWith(".md",) ? base : `${base}.md`;
}

/** Pure markdown rendering — byte-identical output for identical inputs. */
export function render(
  report: LinkageReport,
  epics: Map<string, { title: string; status: string }>,
  header: string,
): string {
  const out = [
    header,
    "# Plan entry map",
    "",
    "<!-- Generated by `bun run plan:entry-map` — do NOT edit by hand. -->",
    "",
  ];
  out.push("## Lanes → tickets", "",);
  if (report.lanes.length === 0) {
    out.push("_No LANE-*.md files found — lanes are unclaimed or live outside this checkout._", "",);
  } else {
    out.push("| Lane | Claim | Resolves to |", "| --- | --- | --- |",);
    for (const lane of report.lanes) {
      if (lane.claims.length === 0) { out.push(`| ${lane.lane} | _(none)_ | — |`,); }
      for (const claim of lane.claims) {
        out.push(`| ${lane.lane} | \`${claim.token}\` | ${claim.file ?? "⚠ unresolvable (warning)"} |`,);
      }
    }
    out.push("",);
  }
  out.push("## Tickets → epics (lane scope)", "",);
  out.push("| Ticket | Status | Index | Issue | Epic |", "| --- | --- | --- | --- | --- |",);
  const epicFiles = new Set<string>();
  for (const t of report.scoped) {
    const epicFile = t.epic === "" ? "—" : epicFileOf(t.epic,);
    if (epicFile !== "—") { epicFiles.add(epicFile,); }
    out.push(
      `| ${t.file} | ${t.status} | ${t.indexTitle === null ? "⚠ missing" : "✓"} | ${t.gitIssue ?? "—"} | ${epicFile} |`,
    );
  }
  out.push("", "## Epics", "", "| Epic file | Title | Status |", "| --- | --- | --- |",);
  for (const file of [...epicFiles,].sort()) {
    const epic = epics.get(file,);
    out.push(`| ${file} | ${epic?.title ?? "⚠ missing file"} | ${epic?.status ?? "—"} |`,);
  }
  out.push("", "## Findings", "",);
  for (const drift of report.drifts) {
    for (const problem of drift.problems) { out.push(`- ✗ drift: ${drift.file}: ${problem}`,); }
  }
  if (report.warnings.length === 0 && report.drifts.length === 0) {
    out.push("_None — lanes resolve and the canonical id agrees._",);
  }
  out.push("",);
  return out.join("\n",);
}

/** Fresh output for the worktree this process runs in. Exported for tests. */
export function currentOutput(): string {
  const report = linkageReport(TICKETS_DIR, LANES_DIR, INDEX_PATH,);
  const epics = new Map(
    collectEpics(EPICS_DIR,).map((e,) => [e.file, { title: e.title, status: e.status, },] as const),
  );
  return render(report, epics, generatedHeader(OUT_PATH, ".md",),);
}

function main(): void {
  const check = process.argv.includes("--check",);
  const fresh = currentOutput();
  const report = linkageReport(TICKETS_DIR, LANES_DIR, INDEX_PATH,);
  for (const warn of report.warnings) { console.error(`warning: ${warn}`,); }
  if (!check) {
    writeFileSync(OUT_PATH, fresh,);
    console.log("wrote .plan/entry-map.md",);
    return;
  }
  if (!existsSync(OUT_PATH,)) {
    console.error(".plan/entry-map.md is missing — run `bun run plan:entry-map` to generate",);
    process.exit(1,);
  }
  if (readFileSync(OUT_PATH, "utf8",) !== fresh) {
    console.error(".plan/entry-map.md is stale — run `bun run plan:entry-map` to regenerate",);
    process.exit(1,);
  }
  if (report.drifts.length > 0) {
    for (const drift of report.drifts) {
      for (const problem of drift.problems) { console.error(`drift: ${drift.file}: ${problem}`,); }
    }
    process.exit(1,);
  }
  console.log("ok .plan/entry-map.md is fresh",);
}

if (import.meta.main) { main(); }
