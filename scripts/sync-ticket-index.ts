#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Sync .plan/tickets/index.json with ticket .md files and git issues.
 *
 * Reads:
 *   1. .plan/tickets/*.md — extract frontmatter (title, status, type, priority, epic)
 *   2. git issue ls — build hash→issue lookup
 *   3. .plan/tickets/index.json — current index state
 *
 * Reports:
 *   - Orphan files (.md exists, not in index)
 *   - Phantom entries (index has entry, .md missing)
 *   - Hash mismatches (hash points to wrong/missing issue)
 *   - Status mismatches (index vs git issue disagree)
 *   - Missing hashes (ticket has no hash, but matching issue exists)
 *
 * Usage:
 *   bun run scripts/sync-ticket-index.ts              # dry-run report
 *   bun run scripts/sync-ticket-index.ts --fix        # write fixes to index.json
 *   bun run scripts/sync-ticket-index.ts --verbose    # show all entries
 */

import { execSync, } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync, } from "node:fs";
import { basename, join, } from "node:path";

// ── Types ──────────────────────────────────────────────────────

interface TicketFile {
  path: string;
  filename: string;
  title: string;
  status: string;
  type: string;
  priority: string;
  epic: string;
  hash: string | null;
  gitIssue: string | null;
}

interface GitIssue {
  hash: string;
  status: "open" | "closed" | "done";
  title: string;
  extid: string | null; // e.g. "TASK-006" from "TASK-006: Some title"
}

interface IndexEntry {
  hash: string;
  extid: string;
  type: string;
  title: string;
  label: string;
  priority: string;
  epic: string;
  tags: string[];
  source: string;
  git_issue?: string;
  status?: string;
  closed_issue?: boolean;
}

interface SyncReport {
  orphanFiles: string[];
  phantomEntries: string[];
  hashMismatches: Array<{
    extid: string;
    indexHash: string;
    gitTitle: string | null;
    gitStatus: string | null;
    ticketTitle: string;
  }>;
  statusMismatches: Array<{
    extid: string;
    indexStatus: string;
    gitStatus: string;
  }>;
  missingHashes: Array<{
    extid: string;
    ticketTitle: string;
    suggestedHash: string | null;
    suggestedTitle: string | null;
  }>;
  fixesApplied: string[];
}

// ── Config ─────────────────────────────────────────────────────

const ROOT = process.cwd();
const TICKETS_DIR = join(ROOT, ".plan/tickets",);
const INDEX_PATH = join(TICKETS_DIR, "index.json",);

// ── Parse ticket .md frontmatter ───────────────────────────────

function parseTicketFile(filePath: string,): TicketFile | null {
  try {
    const raw = readFileSync(filePath, "utf8",);
    const lines = raw.split("\n",).slice(0, 30,); // only first 30 lines

    const filename = basename(filePath,);

    // Extract title from first heading
    const titleMatch = lines.find((l,) => l.startsWith("# ",));
    const title = titleMatch?.replace(/^#\s+(?:TASK|FEAT|BUG|FIX|EPIC|SOL|INFRA):\s*/i, "",).trim() ??
      filename.replace(/\.md$/, "",);

    // Extract metadata fields
    const statusMatch = raw.match(/\*\*Status:\*\*\s*(.+)/i,);
    const priorityMatch = raw.match(/\*\*Priority:\*\*\s*(.+)/i,);
    const epicMatch = raw.match(/\*\*Epic:\*\*\s*(.+)/i,);

    // Extract type from heading
    const typeMatch = titleMatch?.match(/^#\s+(TASK|FEAT|BUG|FIX|EPIC|SOL|INFRA)/i,);
    const type = typeMatch?.[1]?.toUpperCase() ?? guessType(filename,);

    // Extract hash from content (7+ hex chars, likely git issue hash)
    const hashMatch = raw.match(/\b([0-9a-f]{7,40})\b/,);

    // Extract git issue reference (e.g. "git issue: abc1234" or "Issue: abc1234")
    const gitIssueMatch = raw.match(/(?:git.?issue|issue):\s*([a-f0-9]{7,})/i,);

    // Normalize status
    const rawStatus = statusMatch?.[1]?.trim() ?? "undefined";
    const status = normalizeStatus(rawStatus,);

    return {
      path: filePath,
      filename,
      title,
      status,
      type,
      priority: priorityMatch?.[1]?.trim() ?? "medium",
      epic: epicMatch?.[1]?.trim() ?? "",
      hash: gitIssueMatch?.[1] ?? hashMatch?.[1] ?? null,
      gitIssue: gitIssueMatch?.[1] ?? null,
    };
  } catch {
    return null;
  }
}

function guessType(filename: string,): string {
  const prefix = filename.split("-",)[0]?.toUpperCase();
  if (["TASK", "FEAT", "BUG", "FIX", "EPIC", "SOL", "INFRA",].includes(prefix ?? "",)) {
    return prefix!;
  }
  return "TASK";
}

function normalizeStatus(raw: string,): string {
  const lower = raw.toLowerCase();
  if (lower.includes("done",) || lower.includes("complete",) || lower.includes("closed",)) { return "done"; }
  if (lower.includes("progress",) || lower.includes("wip",)) { return "in_progress"; }
  if (lower.includes("not started",) || lower.includes("pending",) || lower === "open") { return "open"; }
  if (lower.includes("draft",)) { return "draft"; }
  if (lower.includes("cancelled",)) { return "cancelled"; }
  return raw; // keep as-is if unknown
}

// ── Read git issues ────────────────────────────────────────────

function readGitIssues(): Map<string, GitIssue> {
  const issues = new Map<string, GitIssue>();

  try {
    const output = execSync("git issue ls --all --format oneline 2>/dev/null", {
      encoding: "utf8",
      timeout: 10_000,
    },);

    for (const line of output.trim().split("\n",)) {
      const m = line.match(/^([0-9a-f]{7,40})\s+(open|closed|done)\s+(.*)/,);
      if (!m) { continue; }

      const hash = m[1].slice(0, 7,);
      const status = m[2] as "open" | "closed" | "done";
      const title = m[3];

      // Extract extid from title (e.g. "TASK-006: Some title" → "TASK-006")
      const extidMatch = title.match(/^(TASK|FEAT|BUG|FIX|EPIC|SOL|INFRA)-\d+/i,);
      const extid = extidMatch?.[0]?.toUpperCase() ?? null;

      issues.set(hash, { hash, status, title, extid, },);
    }
  } catch {
    // git issue not available — continue with empty map
  }

  return issues;
}

// ── Read index.json ────────────────────────────────────────────

function readIndex(): Record<string, IndexEntry> {
  if (!existsSync(INDEX_PATH,)) { return {}; }
  try {
    return JSON.parse(readFileSync(INDEX_PATH, "utf8",),);
  } catch {
    return {};
  }
}

// ── Reconcile ──────────────────────────────────────────────────

function reconcile(
  ticketFiles: TicketFile[],
  gitIssues: Map<string, GitIssue>,
  index: Record<string, IndexEntry>,
  verbose: boolean,
): SyncReport {
  const report: SyncReport = {
    orphanFiles: [],
    phantomEntries: [],
    hashMismatches: [],
    statusMismatches: [],
    missingHashes: [],
    fixesApplied: [],
  };

  // Build lookup: filename → ticket file
  const fileByExtid = new Map<string, TicketFile>();
  for (const tf of ticketFiles) {
    const extid = tf.filename.replace(/\.md$/, "",).toUpperCase();
    fileByExtid.set(extid, tf,);
  }

  // Build lookup: index hash → git issue
  const indexHashes = new Set(
    Object.values(index,)
      .map((e,) => e.hash)
      .filter((h,) => h && h !== "pending"),
  );

  // 1. Check orphan files (file exists, not in index)
  for (const tf of ticketFiles) {
    const extid = tf.filename.replace(/\.md$/, "",).toUpperCase();
    if (!index[extid]) {
      report.orphanFiles.push(tf.filename,);
    }
  }

  // 2. Check phantom entries (index has entry, file missing)
  for (const [extid, entry,] of Object.entries(index,)) {
    // Try multiple naming conventions to find the file
    const candidates = [
      entry.source,
      `.plan/tickets/${extid}.md`,
      `.plan/tickets/${extid.toLowerCase()}.md`,
      `.plan/tickets/TASK-${extid.toLowerCase()}.md`,
      `.plan/tickets/FEAT-${extid.toLowerCase()}.md`,
      `.plan/tickets/BUG-${extid.toLowerCase()}.md`,
    ].filter(Boolean,);

    const found = candidates.some((src,) => {
      const filePath = join(TICKETS_DIR, src!.replace(/^\.plan\/tickets\//, "",),);
      return existsSync(filePath,);
    },);

    if (!found) {
      report.phantomEntries.push(extid,);
    }
  }

  // 3. Check hash mismatches
  for (const [extid, entry,] of Object.entries(index,)) {
    if (!entry.hash || entry.hash === "pending") { continue; }

    const issue = gitIssues.get(entry.hash,);
    if (!issue) {
      // Hash doesn't match any git issue
      const tf = fileByExtid.get(extid,);
      report.hashMismatches.push({
        extid,
        indexHash: entry.hash,
        gitTitle: null,
        gitStatus: null,
        ticketTitle: tf?.title ?? entry.title,
      },);
      continue;
    }

    // Check if title matches (lenient: check if core words overlap)
    const indexTitleNorm = entry.title.toLowerCase().replace(/[^a-z0-9]/g, "",);
    const issueTitleNorm = issue.title.toLowerCase().replace(/[^a-z0-9]/g, "",);

    // Remove common prefixes from issue title (e.g. "TASK-006: " or "FEAT-070: ")
    const issueTitleClean = issueTitleNorm.replace(/^(task|feat|bug|fix|epic|sol|infra)[\-_]\d+[:\-_\s]*/i, "",);

    // Also try matching extid directly
    const extidNorm = extid.toLowerCase().replace(/[^a-z0-9]/g, "",);

    // Extract meaningful words from extid (skip common prefixes like "task", "feat", "epic")
    const extidWords = extid.toLowerCase()
      .replace(/^(task|feat|bug|fix|epic|sol|infra)[\-_]/i, "",)
      .split(/[^a-z0-9]+/,)
      .filter(w => w.length > 2);
    const issueWords = issueTitleClean.split(/[^a-z0-9]+/,).filter(w => w.length > 2);

    // Count word overlap
    const overlap = extidWords.filter(w => issueWords.some(iw => w === iw || w.includes(iw,) || iw.includes(w,)));
    const overlapRatio = overlap.length / Math.max(extidWords.length, 1,);

    // Check if titles share significant overlap (at least 10 chars)
    // Also accept if 2+ words overlap, or if the first significant word matches
    const titleMatch = indexTitleNorm.includes(issueTitleClean.slice(0, 15,),) ||
      issueTitleClean.includes(indexTitleNorm.slice(0, 15,),) ||
      indexTitleNorm.includes(issueTitleNorm.slice(0, 15,),) ||
      issueTitleNorm.includes(indexTitleNorm.slice(0, 15,),) ||
      issueTitleNorm.startsWith(extidNorm,) ||
      issueTitleClean.startsWith(extidNorm,) ||
      overlap.length >= 2 ||
      (overlap.length >= 1 && extidWords.length <= 3);

    if (!titleMatch) {
      report.hashMismatches.push({
        extid,
        indexHash: entry.hash,
        gitTitle: issue.title,
        gitStatus: issue.status,
        ticketTitle: entry.title,
      },);
    }
  }

  // 4. Check status mismatches
  for (const [extid, entry,] of Object.entries(index,)) {
    if (!entry.hash || entry.hash === "pending") { continue; }

    const issue = gitIssues.get(entry.hash,);
    if (!issue) { continue; }

    const indexStatus = normalizeStatus(entry.status ?? "undefined",);
    const gitStatus = issue.status === "done" ? "done" : issue.status === "closed" ? "done" : issue.status;

    if (indexStatus !== gitStatus && gitStatus !== "open") {
      // Only flag if git issue is closed/done but index says otherwise
      report.statusMismatches.push({
        extid,
        indexStatus,
        gitStatus,
      },);
    }
  }

  // 5. Find missing hashes (file has content, no hash, but matching git issue exists)
  for (const tf of ticketFiles) {
    const extid = tf.filename.replace(/\.md$/, "",).toUpperCase();
    const entry = index[extid];

    if (entry?.hash && entry.hash !== "pending") { continue; // already has hash
     }
    if (tf.hash) { continue; // file has hash, but index doesn't — handled by orphan check
     }

    // Try to find matching git issue by title
    for (const [, issue,] of gitIssues) {
      if (issue.extid === extid) {
        report.missingHashes.push({
          extid,
          ticketTitle: tf.title,
          suggestedHash: issue.hash,
          suggestedTitle: issue.title,
        },);
        break;
      }
    }
  }

  return report;
}

// ── Apply fixes ────────────────────────────────────────────────

function applyFixes(
  index: Record<string, IndexEntry>,
  report: SyncReport,
  ticketFiles: TicketFile[],
  gitIssues: Map<string, GitIssue>,
): Record<string, IndexEntry> {
  const fixed = { ...index, };
  const fileByExtid = new Map<string, TicketFile>();
  for (const tf of ticketFiles) {
    const extid = tf.filename.replace(/\.md$/, "",).toUpperCase();
    fileByExtid.set(extid, tf,);
  }

  // Fix status mismatches
  for (const mismatch of report.statusMismatches) {
    if (fixed[mismatch.extid]) {
      fixed[mismatch.extid] = {
        ...fixed[mismatch.extid],
        status: mismatch.gitStatus,
      };
      report.fixesApplied.push(`${mismatch.extid}: status ${mismatch.indexStatus} → ${mismatch.gitStatus}`,);
    }
  }

  // Fix missing hashes
  for (const missing of report.missingHashes) {
    if (fixed[missing.extid]) {
      fixed[missing.extid] = {
        ...fixed[missing.extid],
        hash: missing.suggestedHash!,
      };
      report.fixesApplied.push(`${missing.extid}: added hash ${missing.suggestedHash}`,);
    }
  }

  // Fix phantom entries by trying to find matching files with different names
  for (const extid of report.phantomEntries) {
    if (!fixed[extid]) { continue; }

    // Try different file name patterns
    const patterns = [
      `${extid}.md`,
      `${extid.toLowerCase()}.md`,
      `TASK-${extid.toLowerCase()}.md`,
      `FEAT-${extid.toLowerCase()}.md`,
      `BUG-${extid.toLowerCase()}.md`,
    ];

    for (const pattern of patterns) {
      const filePath = join(TICKETS_DIR, pattern,);
      if (existsSync(filePath,)) {
        fixed[extid] = {
          ...fixed[extid],
          source: `.plan/tickets/${pattern}`,
        };
        report.fixesApplied.push(`${extid}: fixed source path to ${pattern}`,);
        break;
      }
    }
  }

  // Add orphan files to index (skip if source path already exists in any entry)
  const existingSources = new Set(
    Object.values(fixed,).map((e,) => e.source?.toLowerCase()),
  );

  for (const filename of report.orphanFiles) {
    const extid = filename.replace(/\.md$/, "",).toUpperCase();
    if (fixed[extid]) { continue; // key already exists
     }

    const sourcePath = `.plan/tickets/${filename}`;
    if (existingSources.has(sourcePath.toLowerCase(),)) { continue; // source already tracked
     }

    const tf = fileByExtid.get(extid,);
    if (!tf) { continue; }

    // Try to find matching git issue
    let gitIssueHash = tf.hash;
    if (!gitIssueHash) {
      for (const [, issue,] of gitIssues) {
        if (issue.extid === extid) {
          gitIssueHash = issue.hash;
          break;
        }
      }
    }

    fixed[extid] = {
      hash: gitIssueHash ?? "pending",
      extid,
      type: tf.type,
      title: tf.title,
      label: tf.type.toLowerCase(),
      priority: tf.priority,
      epic: tf.epic,
      tags: [],
      source: sourcePath,
    };
    existingSources.add(sourcePath.toLowerCase(),);
    report.fixesApplied.push(`${extid}: added to index (from orphan file)`,);
  }

  return fixed;
}

// ── Main ───────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2,);
  const fixMode = args.includes("--fix",);
  const verbose = args.includes("--verbose",);
  const help = args.includes("--help",) || args.includes("-h",);

  if (help) {
    console.log(`
Sync .plan/tickets/index.json with ticket .md files and git issues.

Usage:
  bun run scripts/sync-ticket-index.ts              # dry-run report
  bun run scripts/sync-ticket-index.ts --fix        # write fixes to index.json
  bun run scripts/sync-ticket-index.ts --verbose    # show all entries

Options:
  --fix       Write fixes to index.json
  --verbose   Show detailed entry-level output
  --help      Show this help
`,);
    process.exit(0,);
  }

  // Read sources
  if (!existsSync(TICKETS_DIR,)) {
    console.error(`Tickets directory not found: ${TICKETS_DIR}`,);
    process.exit(1,);
  }

  const mdFiles = readdirSync(TICKETS_DIR,).filter(
    (f,) => f.endsWith(".md",) && /^(TASK|FEAT|BUG|FIX|EPIC|SOL|INFRA)-/i.test(f,),
  );

  const ticketFiles: TicketFile[] = [];
  for (const f of mdFiles) {
    const tf = parseTicketFile(join(TICKETS_DIR, f,),);
    if (tf) { ticketFiles.push(tf,); }
  }

  const gitIssues = readGitIssues();
  const index = readIndex();

  console.log(`\n📊 Scanning...`,);
  console.log(`   Ticket .md files:  ${ticketFiles.length}`,);
  console.log(`   Git issues:        ${gitIssues.size}`,);
  console.log(`   Index entries:     ${Object.keys(index,).length}`,);

  // Reconcile
  const report = reconcile(ticketFiles, gitIssues, index, verbose,);

  // Report
  console.log(`\n📋 Reconciliation Report`,);
  console.log(`${"─".repeat(60,)}`,);

  if (report.orphanFiles.length > 0) {
    console.log(`\n🔴 Orphan files (.md not in index): ${report.orphanFiles.length}`,);
    if (verbose) {
      report.orphanFiles.forEach((f,) => console.log(`   ${f}`,));
    } else {
      report.orphanFiles.slice(0, 10,).forEach((f,) => console.log(`   ${f}`,));
      if (report.orphanFiles.length > 10) {
        console.log(`   ... and ${report.orphanFiles.length - 10} more`,);
      }
    }
  } else {
    console.log(`\n🟢 No orphan files`,);
  }

  if (report.phantomEntries.length > 0) {
    console.log(`\n🔴 Phantom entries (index has no .md): ${report.phantomEntries.length}`,);
    if (verbose) {
      report.phantomEntries.forEach((e,) => console.log(`   ${e}`,));
    } else {
      report.phantomEntries.slice(0, 10,).forEach((e,) => console.log(`   ${e}`,));
      if (report.phantomEntries.length > 10) {
        console.log(`   ... and ${report.phantomEntries.length - 10} more`,);
      }
    }
  } else {
    console.log(`\n🟢 No phantom entries`,);
  }

  if (report.hashMismatches.length > 0) {
    console.log(`\n🔴 Hash mismatches: ${report.hashMismatches.length}`,);
    for (const m of report.hashMismatches) {
      console.log(`   ${m.extid}: index=${m.indexHash} → git="${m.gitTitle ?? "NOT FOUND"}" (${m.gitStatus ?? "?"})`,);
    }
  } else {
    console.log(`\n🟢 No hash mismatches`,);
  }

  if (report.statusMismatches.length > 0) {
    console.log(`\n🟡 Status mismatches: ${report.statusMismatches.length}`,);
    for (const m of report.statusMismatches) {
      console.log(`   ${m.extid}: index=${m.indexStatus} vs git=${m.gitStatus}`,);
    }
  } else {
    console.log(`\n🟢 No status mismatches`,);
  }

  if (report.missingHashes.length > 0) {
    console.log(`\n🟡 Missing hashes (could be linked): ${report.missingHashes.length}`,);
    if (verbose) {
      for (const m of report.missingHashes) {
        console.log(`   ${m.extid}: suggested hash=${m.suggestedHash} (git="${m.suggestedTitle}")`,);
      }
    } else {
      report.missingHashes.slice(0, 10,).forEach((m,) => {
        console.log(`   ${m.extid}: → ${m.suggestedHash}`,);
      },);
      if (report.missingHashes.length > 10) {
        console.log(`   ... and ${report.missingHashes.length - 10} more`,);
      }
    }
  } else {
    console.log(`\n🟢 No missing hashes`,);
  }

  // Summary
  const totalIssues = report.orphanFiles.length +
    report.phantomEntries.length +
    report.hashMismatches.length +
    report.statusMismatches.length;

  console.log(`\n${"═".repeat(60,)}`,);
  if (totalIssues === 0) {
    console.log(`✅ Index is in sync`,);
  } else {
    console.log(`⚠️  ${totalIssues} issue(s) found`,);
  }

  // Apply fixes
  if (fixMode && totalIssues > 0) {
    console.log(`\n🔧 Applying fixes...`,);
    const fixedIndex = applyFixes(index, report, ticketFiles, gitIssues,);

    // Sort by extid
    const sorted = Object.fromEntries(
      Object.entries(fixedIndex,).sort(([a,], [b,],) => a.localeCompare(b,)),
    );

    writeFileSync(INDEX_PATH, JSON.stringify(sorted, null, 2,) + "\n",);
    console.log(`✅ Wrote ${INDEX_PATH}`,);

    if (report.fixesApplied.length > 0) {
      console.log(`\n📝 Changes:`,);
      report.fixesApplied.forEach((f,) => console.log(`   ${f}`,));
    }
  } else if (fixMode && totalIssues === 0) {
    console.log(`\nNothing to fix`,);
  } else if (totalIssues > 0) {
    console.log(`\nRun with --fix to apply automatic fixes`,);
  }

  // Exit code
  process.exit(totalIssues > 0 ? 1 : 0,);
}

main();
