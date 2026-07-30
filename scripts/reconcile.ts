#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Unified reconciliation script for docs/ and .plan/ cross-references.
 *
 * Checks:
 *   1. docs/spec/ vs .plan/epics/ — specs without epics and vice versa
 *   2. docs/frontend/ vs .plan/epics/ — frontend docs without epics
 *   3. .plan/tickets/ vs .plan/epics/ — orphan tickets
 *   4. .plan/design/ vs .plan/epics/ — orphan design docs
 *   5. .plan/epics/ vs docs/spec/ — epics without specs
 *   6. future-features-plan.md vs actual epic numbering
 *
 * Usage:
 *   bun run scripts/reconcile.ts              # report only
 *   bun run scripts/reconcile.ts --fix        # apply auto-fixes
 *   bun run scripts/reconcile.ts --verbose    # show all entries
 */

import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync, } from "node:fs";
import { basename, join, } from "node:path";

const ROOT = process.cwd();
const SPEC_DIR = join(ROOT, "docs/spec",);
const FRONTEND_DIR = join(ROOT, "docs/frontend",);
const EPICS_DIR = join(ROOT, ".plan/epics",);
const TICKETS_DIR = join(ROOT, ".plan/tickets",);
const DESIGN_DIR = join(ROOT, ".plan/design",);
const META_DIR = join(ROOT, "docs/meta",);
const FUTURE_FEATURES = join(META_DIR, "future-features-plan.md",);

// ── Types ──────────────────────────────────────────────

interface ReconciliationReport {
  specWithoutEpic: string[];
  epicWithoutSpec: string[];
  frontendWithoutEpic: string[];
  orphanTickets: string[];
  orphanDesignDocs: string[];
  epicWithoutTicket: string[];
  futureFeaturesGaps: string[];
  duplicates: string[];
}

// ── Helpers ────────────────────────────────────────────

function normalize(s: string,): string {
  return s.toLowerCase().replace(/[-_]/g, " ",);
}

function keywordOverlap(a: string, b: string,): boolean {
  const wordsA = normalize(a,).split(/\s+/,).filter((w,) => w.length > 3);
  const wordsB = normalize(b,).split(/\s+/,).filter((w,) => w.length > 3);
  return wordsA.some((w,) => wordsB.some((v,) => v.includes(w,) || w.includes(v,)));
}

function readMarkdownFiles(dir: string,): string[] {
  if (!existsSync(dir,)) { return []; }
  return readdirSync(dir,).filter((f,) => f.endsWith(".md",));
}

function extractFrontmatterField(content: string, field: string,): string | null {
  const lines = content.split("\n",);
  for (const line of lines) {
    const pattern = `**${field}:**`;
    if (line.includes(pattern,)) {
      const idx = line.indexOf(pattern,);
      return line.slice(idx + pattern.length,).trim();
    }
  }
  return null;
}

// ── Checks ─────────────────────────────────────────────

function checkSpecVsEpics(report: ReconciliationReport,): void {
  const specDocs = readMarkdownFiles(SPEC_DIR,).map((f,) => f.replace(/\.md$/, "",));
  const epicFiles = readMarkdownFiles(EPICS_DIR,).map((f,) => f.replace(/^epic-/, "",).replace(/\.md$/, "",));

  for (const spec of specDocs) {
    const matched = epicFiles.some((e,) => keywordOverlap(spec, e,));
    if (!matched) { report.specWithoutEpic.push(spec,); }
  }

  const matchedEpics = new Set<string>();
  for (const spec of specDocs) {
    for (const epic of epicFiles) {
      if (keywordOverlap(spec, epic,) && !matchedEpics.has(epic,)) {
        matchedEpics.add(epic,);
      }
    }
  }
  for (const epic of epicFiles) {
    if (!matchedEpics.has(epic,)) { report.epicWithoutSpec.push(epic,); }
  }
}

function checkFrontendVsEpics(report: ReconciliationReport,): void {
  const frontendDocs = readMarkdownFiles(FRONTEND_DIR,).map((f,) => f.replace(/\.md$/, "",));
  const epicFiles = readMarkdownFiles(EPICS_DIR,).map((f,) => f.replace(/^epic-/, "",).replace(/\.md$/, "",));

  for (const doc of frontendDocs) {
    const matched = epicFiles.some((e,) => keywordOverlap(doc, e,));
    if (!matched) { report.frontendWithoutEpic.push(doc,); }
  }
}

function checkTicketsVsEpics(report: ReconciliationReport,): void {
  const ticketFiles = readMarkdownFiles(TICKETS_DIR,);
  const epicFiles = readMarkdownFiles(EPICS_DIR,);
  const epicNames = epicFiles.map((f,) => f.replace(/^epic-/, "",).replace(/\.md$/, "",));

  for (const ticket of ticketFiles) {
    const content = readFileSync(join(TICKETS_DIR, ticket,), "utf8",);
    const extid = extractFrontmatterField(content, "ExtID",) ??
      extractFrontmatterField(content, "extid",) ??
      ticket.replace(/\.md$/, "",);

    // Extract epic reference from ticket
    const epicRef = extractFrontmatterField(content, "Epic",) ??
      extractFrontmatterField(content, "epic",);

    if (epicRef) {
      const matched = epicNames.some((e,) => keywordOverlap(epicRef, e,));
      if (!matched) { report.orphanTickets.push(ticket,); }
    } else {
      // No epic reference — check if name matches any epic
      const ticketName = ticket.replace(/\.md$/, "",);
      const matched = epicNames.some((e,) => keywordOverlap(ticketName, e,));
      if (!matched) { report.orphanTickets.push(ticket,); }
    }
  }
}

function checkDesignDocsVsEpics(report: ReconciliationReport,): void {
  const designDocs = readMarkdownFiles(DESIGN_DIR,).map((f,) => f.replace(/\.md$/, "",));
  const epicFiles = readMarkdownFiles(EPICS_DIR,).map((f,) => f.replace(/^epic-/, "",).replace(/\.md$/, "",));

  for (const doc of designDocs) {
    const matched = epicFiles.some((e,) => keywordOverlap(doc, e,));
    if (!matched) { report.orphanDesignDocs.push(doc,); }
  }
}

function checkEpicsVsTickets(report: ReconciliationReport,): void {
  const epicFiles = readMarkdownFiles(EPICS_DIR,);
  const ticketFiles = readMarkdownFiles(TICKETS_DIR,);

  const ticketEpics = new Set<string>();
  for (const ticket of ticketFiles) {
    const content = readFileSync(join(TICKETS_DIR, ticket,), "utf8",);
    const epicRef = extractFrontmatterField(content, "Epic",) ??
      extractFrontmatterField(content, "epic",);
    if (epicRef) { ticketEpics.add(normalize(epicRef,),); }
  }

  for (const epic of epicFiles) {
    const epicName = normalize(epic.replace(/^epic-/, "",).replace(/\.md$/, "",),);
    if (!ticketEpics.has(epicName,)) {
      // Check if any ticket references this epic by keyword
      const hasTicket = [...ticketEpics,].some((te,) => keywordOverlap(epicName, te,));
      if (!hasTicket) { report.epicWithoutTicket.push(epic,); }
    }
  }
}

function checkFutureFeatures(report: ReconciliationReport,): void {
  if (!existsSync(FUTURE_FEATURES,)) { return; }

  const content = readFileSync(FUTURE_FEATURES, "utf8",);
  const epicFiles = readMarkdownFiles(EPICS_DIR,);
  const actualEpics = epicFiles.map((f,) => f.replace(/^epic-/, "",).replace(/\.md$/, "",));

  // Find EPIC-2026 references in future-features-plan.md
  const epicRefs = content.match(/EPIC-2026-\d+/g,) ?? [];
  const uniqueRefs = [...new Set(epicRefs,),];

  // Check if referenced epics exist
  for (const ref of uniqueRefs) {
    const refNum = ref.replace("EPIC-2026-", "",);
    const matchingEpic = actualEpics.find((e,) => {
      // Try to match by number in the epic file
      const epicContent = readFileSync(join(EPICS_DIR, `epic-${e}.md`,), "utf8",);
      return epicContent.includes(ref,) || epicContent.includes(`EPIC-2026-${refNum}`,);
    },);
    if (!matchingEpic) {
      report.futureFeaturesGaps.push(`${ref} not found in .plan/epics/`,);
    }
  }

  // Check for epics not in future-features-plan.md (numbered > 38)
  const maxRefNum = Math.max(...uniqueRefs.map((r,) => parseInt(r.replace("EPIC-2026-", "",),) ?? 0),);
  for (const epic of actualEpics) {
    const epicContent = readFileSync(join(EPICS_DIR, `epic-${epic}.md`,), "utf8",);
    const epicRefsInFile = epicContent.match(/EPIC-2026-\d+/g,) ?? [];
    for (const ref of epicRefsInFile) {
      const num = parseInt(ref.replace("EPIC-2026-", "",),);
      if (num > maxRefNum && num > 38) {
        report.futureFeaturesGaps.push(`Epic ${epic} references ${ref} not in future-features-plan.md`,);
      }
    }
  }
}

function findDuplicates(report: ReconciliationReport,): void {
  const ticketFiles = readMarkdownFiles(TICKETS_DIR,);
  const seen = new Map<string, string[]>();

  for (const ticket of ticketFiles) {
    const content = readFileSync(join(TICKETS_DIR, ticket,), "utf8",);
    const titleMatch = content.match(/^#\s+(.+)$/m,);
    if (titleMatch) {
      const title = titleMatch[1].trim().toLowerCase();
      if (!seen.has(title,)) { seen.set(title, [],); }
      seen.get(title,)!.push(ticket,);
    }
  }

  for (const [title, files,] of seen) {
    if (files.length > 1) {
      report.duplicates.push(`${title}: ${files.join(", ",)}`,);
    }
  }
}

// ── Main ───────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2,);
  const fix = args.includes("--fix",);
  const verbose = args.includes("--verbose",);

  const report: ReconciliationReport = {
    specWithoutEpic: [],
    epicWithoutSpec: [],
    frontendWithoutEpic: [],
    orphanTickets: [],
    orphanDesignDocs: [],
    epicWithoutTicket: [],
    futureFeaturesGaps: [],
    duplicates: [],
  };

  console.log("🔍 Running reconciliation checks...\n",);

  checkSpecVsEpics(report,);
  checkFrontendVsEpics(report,);
  checkTicketsVsEpics(report,);
  checkDesignDocsVsEpics(report,);
  checkEpicsVsTickets(report,);
  checkFutureFeatures(report,);
  findDuplicates(report,);

  // Print report
  console.log("=== SPECS WITHOUT MATCHING EPIC ===",);
  report.specWithoutEpic.forEach((s,) => console.log(`  ❌ ${s}`,));
  console.log(`  Total: ${report.specWithoutEpic.length}\n`,);

  console.log("=== EPICS WITHOUT MATCHING SPEC ===",);
  report.epicWithoutSpec.forEach((e,) => console.log(`  ⚠️  ${e}`,));
  console.log(`  Total: ${report.epicWithoutSpec.length}\n`,);

  console.log("=== FRONTEND DOCS WITHOUT MATCHING EPIC ===",);
  report.frontendWithoutEpic.forEach((d,) => console.log(`  ⚠️  ${d}`,));
  console.log(`  Total: ${report.frontendWithoutEpic.length}\n`,);

  console.log("=== ORPHAN TICKETS (no matching epic) ===",);
  report.orphanTickets.forEach((t,) => console.log(`  📎 ${t}`,));
  console.log(`  Total: ${report.orphanTickets.length}\n`,);

  console.log("=== ORPHAN DESIGN DOCS ===",);
  report.orphanDesignDocs.forEach((d,) => console.log(`  📎 ${d}`,));
  console.log(`  Total: ${report.orphanDesignDocs.length}\n`,);

  console.log("=== EPICS WITHOUT TICKETS ===",);
  report.epicWithoutTicket.forEach((e,) => console.log(`  📎 ${e}`,));
  console.log(`  Total: ${report.epicWithoutTicket.length}\n`,);

  console.log("=== FUTURE FEATURES GAPS ===",);
  report.futureFeaturesGaps.forEach((g,) => console.log(`  📎 ${g}`,));
  console.log(`  Total: ${report.futureFeaturesGaps.length}\n`,);

  console.log("=== DUPLICATE TITLES ===",);
  report.duplicates.forEach((d,) => console.log(`  📎 ${d}`,));
  console.log(`  Total: ${report.duplicates.length}\n`,);

  // Summary
  const totalIssues = report.specWithoutEpic.length +
    report.epicWithoutSpec.length +
    report.frontendWithoutEpic.length +
    report.orphanTickets.length +
    report.orphanDesignDocs.length +
    report.epicWithoutTicket.length +
    report.futureFeaturesGaps.length +
    report.duplicates.length;

  console.log(`\n📊 Summary: ${totalIssues} issues found`,);

  if (fix && report.orphanTickets.length > 0) {
    console.log("\n🧹 Removing orphan tickets...",);
    for (const ticket of report.orphanTickets) {
      const path = join(TICKETS_DIR, ticket,);
      if (existsSync(path,)) {
        unlinkSync(path,);
        console.log(`  Removed: ${ticket}`,);
      }
    }
  }
}

main();
