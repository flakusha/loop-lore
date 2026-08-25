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
 *
 * --fix also resolves placeholder hashes (index hash with no git-issue /
 * commit provenance) by linking to a matching git issue (by extid) or, if
 * none exists, creating one and writing its ref back into the .md file.
 */

import { execSync, } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync, } from "node:fs";
import { basename, join, } from "node:path";
import {
  type GitIssue,
  type IndexEntry,
  normalizeStatus,
  reconcile,
  type SyncReport,
  type TicketFile,
} from "./lib/sync-ticket";

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
    const title =
      titleMatch?.replace(/^#\s+(?:TASK|FEAT|BUG|FIX|EPIC|SOL|INFRA|TEST|PERF|WIRE|IMPROVE):\s*/i, "",).trim() ??
        filename.replace(/\.md$/, "",);

    // Extract metadata fields
    const statusMatch = raw.match(/\*\*Status:\*\*\s*(.+)/i,);
    const priorityMatch = raw.match(/\*\*Priority:\*\*\s*(.+)/i,);
    const epicMatch = raw.match(/\*\*Epic:\*\*\s*(.+)/i,);

    // Extract type from heading
    const typeMatch = titleMatch?.match(/^#\s+(TASK|FEAT|BUG|FIX|EPIC|SOL|INFRA|TEST|PERF|WIRE|IMPROVE)/i,);
    const type = typeMatch?.[1]?.toUpperCase() ?? guessType(filename,);

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
      hash: gitIssueMatch?.[1] ?? null,
      gitIssue: gitIssueMatch?.[1] ?? null,
    };
  } catch {
    return null;
  }
}

function guessType(filename: string,): string {
  const prefix = filename.split("-",)[0]?.toUpperCase();
  if (
    ["TASK", "FEAT", "BUG", "FIX", "EPIC", "SOL", "INFRA", "TEST", "PERF", "WIRE", "IMPROVE",].includes(prefix ?? "",)
  ) {
    return prefix!;
  }
  return "TASK";
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

      // Extract extid from title (e.g. "TASK-006: Some title" → "TASK-006",
      // "TASK-chat-message-search: ..." → "TASK-CHAT-MESSAGE-SEARCH")
      const extidMatch = title.match(/^(TASK|FEAT|BUG|FIX|EPIC|SOL|INFRA)-[a-z0-9-]+/i,);
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

  // Fix placeholder hashes: index hash points to no git issue and is not a
  // real commit (no provenance at all). Resolve by linking to a matching git
  // issue (by extid) — the common case where the stored hash drifted but the
  // real issue still exists — or, if none exists, creating one so the entry
  // gains provenance. Mirrors the missing-hash fix for unprovenanced hashes.
  for (const ph of report.placeholderHashes) {
    const entry = fixed[ph.extid];
    if (!entry) { continue; }

    // 1. Try a matching git issue by extid.
    let target: GitIssue | undefined;
    for (const [, issue,] of gitIssues) {
      if (issue.extid === ph.extid) {
        target = issue;
        break;
      }
    }

    // 2. Otherwise create a git issue so the entry has provenance.
    if (!target) {
      const title = ph.ticketTitle || ph.extid;
      const safeTitle = title.replace(/"/g, '\\"',);
      const body = `Auto-created during index reconciliation (placeholder hash ${ph.indexHash} had no provenance).`;
      try {
        const out = execSync(
          `git issue create "${ph.extid}: ${safeTitle}" -m "${body}" -l task -p medium`,
          { timeout: 15_000, },
        ).toString();
        const hm = out.match(/Created issue ([0-9a-f]{7,})/,);
        if (hm) {
          const newHash = hm[1].slice(0, 7,);
          target = { hash: newHash, status: "open", title: `${ph.extid}: ${title}`, extid: ph.extid, };
          gitIssues.set(newHash, target,);
          report.fixesApplied.push(`${ph.extid}: created git issue ${newHash}`,);
        }
      } catch {
        report.fixesApplied.push(`${ph.extid}: FAILED to create git issue`,);
        continue;
      }
    }

    if (!target) { continue; }

    // 3. Update the index entry.
    fixed[ph.extid] = {
      ...fixed[ph.extid],
      hash: target.hash,
      git_issue: target.hash,
    };
    report.fixesApplied.push(`${ph.extid}: replaced placeholder ${ph.indexHash} → ${target.hash}`,);

    // 4. Update the .md file's git issue ref if present.
    const tf = fileByExtid.get(ph.extid,);
    if (tf) {
      try {
        let raw = readFileSync(tf.path, "utf8",);
        if (/(?:git.?issue|issue):\s*[0-9a-f]{7,}/i.test(raw,)) {
          raw = raw.replace(/(?:git.?issue|issue):\s*[0-9a-f]{7,}/i, `git issue: ${target.hash}`,);
        } else {
          raw = raw.replace(/(\n---\n|$)/, `\n\ngit issue: ${target.hash}\n`,);
        }
        writeFileSync(tf.path, raw,);
        report.fixesApplied.push(`${ph.extid}: linked .md to git issue ${target.hash}`,);
      } catch {
        // non-fatal: the index entry itself is already corrected
      }
    }
  }

  // Fix phantom entries by trying to find matching files with different names.
  // Only relocate entries whose source is empty or already under
  // .plan/tickets/ — never rewrite a distinct source (e.g. .plan/epics/*.md)
  // to a guessed path.
  for (const extid of report.phantomEntries) {
    if (!fixed[extid]) { continue; }

    const src = fixed[extid].source ?? "";
    if (src && !src.startsWith(".plan/tickets/",)) { continue; }

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

    // Resolve the ticket's OWN git issue: authoritative registry lookup by
    // extid FIRST. tf.hash originates from an explicit "git issue:" line in
    // the .md and may be stale or absent — never trusted over the registry.
    let gitIssueHash: string | null = null;
    for (const [, issue,] of gitIssues) {
      if (issue.status === "open" && issue.extid === extid) {
        gitIssueHash = issue.hash;
        break;
      }
    }
    if (!gitIssueHash) { gitIssueHash = tf.gitIssue ?? tf.hash ?? null; }

    fixed[extid] = {
      hash: gitIssueHash ?? "pending",
      git_issue: gitIssueHash ?? undefined,
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

  // Fix missing git_issue links
  for (const m of report.missingGitIssueLinks) {
    if (fixed[m.extid]) {
      fixed[m.extid] = {
        ...fixed[m.extid],
        git_issue: m.suggestedGitIssue,
      };
      report.fixesApplied.push(`${m.extid}: added git_issue = ${m.suggestedGitIssue}`,);
    }
  }

  // Relink entries whose hash points to a CLOSED issue when an OPEN
  // duplicate sharing the same extid exists (ticket was re-created; the old
  // issue was closed). Keeps index bound to the live issue.
  for (const [extid, entry,] of Object.entries(fixed,)) {
    const cur = entry.hash ? gitIssues.get(entry.hash,) : undefined;
    if (!cur || cur.status !== "closed") { continue; }
    let openDup: GitIssue | null = null;
    for (const [, issue,] of gitIssues) {
      if (issue.status === "open" && issue.extid === extid) {
        openDup = issue;
        break;
      }
    }
    if (openDup) {
      fixed[extid] = { ...entry, hash: openDup.hash, git_issue: openDup.hash, };
      report.fixesApplied.push(`${extid}: relinked closed ${cur.hash} → open ${openDup.hash}`,);
    }
  }

  // Close stale open git issues (index=done, git=open)
  for (const m of report.staleOpenGitIssues) {
    try {
      execSync(
        `git issue state ${m.gitIssueHash} --close -m 'Auto-closed: ticket ${m.extid} marked done in index.json'`,
        { timeout: 10_000, },
      );
      report.fixesApplied.push(`${m.extid}: closed git issue ${m.gitIssueHash}`,);
    } catch {
      report.fixesApplied.push(`${m.extid}: FAILED to close git issue ${m.gitIssueHash}`,);
    }
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
    (f,) => f.endsWith(".md",) && /^(TASK|FEAT|BUG|FIX|EPIC|SOL|INFRA|TEST|PERF|WIRE|IMPROVE)-/i.test(f,),
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
  const report = reconcile(ticketFiles, gitIssues, index, verbose, ROOT,);

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

  if (report.placeholderHashes.length > 0) {
    console.log(`\n🟡 Placeholder hashes (no git issue, not a commit): ${report.placeholderHashes.length}`,);
    for (const m of report.placeholderHashes) {
      console.log(`   ${m.extid}: index=${m.indexHash}`,);
    }
  } else {
    console.log(`\n🟢 No placeholder hashes`,);
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

  // ── New: git_issue link + stale + orphan checks ──────────────

  if (report.missingGitIssueLinks.length > 0) {
    console.log(
      `\n🟡 Missing git_issue links (index entry has no git_issue field): ${report.missingGitIssueLinks.length}`,
    );
    for (const m of report.missingGitIssueLinks) {
      console.log(`   ${m.extid}: → ${m.suggestedGitIssue} (git="${m.gitTitle}")`,);
    }
  } else {
    console.log(`\n🟢 No missing git_issue links`,);
  }

  if (report.staleOpenGitIssues.length > 0) {
    console.log(`\n🔴 Stale open git issues (index=done, git=open): ${report.staleOpenGitIssues.length}`,);
    for (const m of report.staleOpenGitIssues) {
      console.log(`   ${m.extid}: git issue ${m.gitIssueHash} still open`,);
    }
  } else {
    console.log(`\n🟢 No stale open git issues`,);
  }

  if (report.orphanGitIssues.length > 0) {
    console.log(`\n🟡 Orphan git issues (open, no index entry): ${report.orphanGitIssues.length}`,);
    for (const m of report.orphanGitIssues) {
      console.log(`   ${m.hash} ${m.extid}: ${m.title.slice(0, 60,)}`,);
    }
  } else {
    console.log(`\n🟢 No orphan git issues`,);
  }

  // Summary — only *actionable* issues gate the result. Placeholder hashes,
  // missing-hash suggestions, missing git_issue links, and orphan git issues
  // are advisory (yellow), not failures.  Stale open git issues are actionable.
  const totalIssues = report.orphanFiles.length +
    report.phantomEntries.length +
    report.hashMismatches.length +
    report.statusMismatches.length +
    report.staleOpenGitIssues.length;
  const advisoryCount = report.placeholderHashes.length +
    report.missingHashes.length +
    report.missingGitIssueLinks.length +
    report.orphanGitIssues.length;

  console.log(`\n${"═".repeat(60,)}`,);

  // Apply fixes (also when only advisory issues exist — e.g. missing-hash links)
  if (fixMode && (totalIssues > 0 || advisoryCount > 0)) {
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

    // Recompute reconciliation on the *fixed* index so the summary reflects the
    // resolved state (e.g. placeholder hashes now linked, not still advisory).
    const postReport = reconcile(ticketFiles, gitIssues, fixedIndex, verbose, ROOT,);
    const postTotal = postReport.orphanFiles.length +
      postReport.phantomEntries.length +
      postReport.hashMismatches.length +
      postReport.statusMismatches.length +
      postReport.staleOpenGitIssues.length;
    const postAdvisory = postReport.placeholderHashes.length +
      postReport.missingHashes.length +
      postReport.missingGitIssueLinks.length +
      postReport.orphanGitIssues.length;

    if (postTotal === 0) {
      console.log(`✅ Index is in sync${postAdvisory > 0 ? ` (${postAdvisory} advisory remaining)` : ""}`,);
    } else {
      console.log(
        `⚠️  ${postTotal} actionable issue(s) remain${postAdvisory > 0 ? `, ${postAdvisory} advisory` : ""}`,
      );
    }
    process.exit(postTotal > 0 ? 1 : 0,);
  }

  if (fixMode && totalIssues === 0) {
    console.log(`\nNothing to fix`,);
  } else if (totalIssues > 0) {
    console.log(`\nRun with --fix to apply automatic fixes`,);
  }

  if (totalIssues === 0) {
    console.log(`✅ Index is in sync${advisoryCount > 0 ? ` (${advisoryCount} advisory)` : ""}`,);
  } else {
    console.log(
      `⚠️  ${totalIssues} actionable issue(s) found${advisoryCount > 0 ? `, ${advisoryCount} advisory` : ""}`,
    );
  }

  // Exit code
  process.exit(totalIssues > 0 ? 1 : 0,);
}

main();
