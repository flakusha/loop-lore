// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Read-only RSI target miner.
 *
 * Projects `.plan/tickets/index.json` (the source of truth; the backlog
 * archive is explicitly stale) into a ranked, timestamp-free target list.
 * Queue integration is deliberately out of scope: this script writes only
 * scratch files under `.tmp/rsi/` and never files or mutates tickets.
 *
 * Usage:
 *   bun scripts/rsi-target-miner.ts [outputDir]
 */
import { mkdirSync, writeFileSync, } from "node:fs";
import { join, } from "node:path";
import { readTicketIndex, } from "../node_modules/giwt/src/plan/feature-matrix";
import type { IndexEntry, } from "../node_modules/giwt/src/tickets/sync-ticket-types";

const ROOT = import.meta.dir + "/..";
const INDEX_PATH = join(ROOT, ".plan", "tickets", "index.json",);
const DEFAULT_OUT_DIR = join(ROOT, ".tmp", "rsi",);

const CLOSED_STATUSES = new Set(["done", "closed", "cancelled", "canceled", "wontfix", "postponed",],);
const REVIEW_PATTERN = /\b(migration|auth|secrets?|security|credentials)\b/i;
const RSI_PATTERN = /\brsi\b|recursive-self-improvement/i;
const TOOLING_PATTERN = /\b(script|tooling|cli|check|checks|gate|gates|deterministic|automation|refactor)\b/i;

export interface RankedTarget {
  extid: string;
  title: string;
  score: number;
  bucket: "auto-file-candidate" | "human-review";
  reasons: string[];
}

export interface MinerResult {
  ranked: RankedTarget[];
  counts: {
    total: number;
    autoFileCandidates: number;
    humanReview: number;
  };
}

/**
 * Score open ticket entries for RSI suitability.
 * @param entries - ticket index projected by readTicketIndex
 * @returns deterministic ranked result; no timestamps, no I/O
 */
export function rankTargets(entries: Record<string, IndexEntry>,): MinerResult {
  const ranked: RankedTarget[] = [];

  for (const entry of Object.values(entries,)) {
    const status = (entry.status ?? "open").toLowerCase();
    if (CLOSED_STATUSES.has(status,)) { continue; }

    const context = [entry.tags.join(" ",), entry.epic, entry.title,].join(" ",);
    const reviewContext = [entry.tags.join(" ",), entry.epic,].join(" ",);
    const priority = (entry.priority ?? "").toLowerCase();
    const reasons: string[] = [];
    let score = 0;

    if (RSI_PATTERN.test(context,)) {
      score += 4;
      reasons.push("rsi-scope",);
    }
    if (TOOLING_PATTERN.test(context,)) {
      score += 2;
      reasons.push("deterministic-tooling",);
    }
    if (priority.includes("critical",) || priority.startsWith("p0",)) {
      score += 2;
      reasons.push("critical-priority",);
    } else if (priority.includes("high",) || priority.startsWith("p1",)) {
      score += 1;
      reasons.push("high-priority",);
    }
    if (status === "in progress" || status === "in_progress") {
      score += 1;
      reasons.push("in-progress",);
    }

    ranked.push({
      extid: entry.extid,
      title: entry.title,
      score,
      bucket: REVIEW_PATTERN.test(reviewContext,) ? "human-review" : "auto-file-candidate",
      reasons,
    },);
  }

  ranked.sort((a, b,) => b.score - a.score || a.extid.localeCompare(b.extid,));

  const humanReview = ranked.filter((t,) => t.bucket === "human-review").length;
  return {
    ranked,
    counts: {
      total: ranked.length,
      autoFileCandidates: ranked.length - humanReview,
      humanReview,
    },
  };
}

/**
 * Render the human-readable scratch report.
 * @param result - ranked result
 * @returns markdown with a stable row order
 */
export function renderMarkdown(result: MinerResult,): string {
  const lines = [
    "# RSI target report",
    "",
    "Read-only projection of `.plan/tickets/index.json`. Queue integration is out of scope.",
    "",
    "| Rank | Ticket | Score | Bucket | Title |",
    "|---:|---|---:|---|---|",
  ];
  result.ranked.forEach((target, i,) => {
    lines.push(`| ${i + 1} | ${target.extid} | ${target.score} | ${target.bucket} | ${target.title} |`,);
  },);
  return lines.join("\n",) + "\n";
}

function main(): void {
  const outDir = process.argv[2] ?? DEFAULT_OUT_DIR;
  const result = rankTargets(readTicketIndex(INDEX_PATH,),);
  const day = new Date().toISOString().slice(0, 10,);
  mkdirSync(outDir, { recursive: true, },);
  writeFileSync(join(outDir, `targets-${day}.json`,), JSON.stringify(result, null, 2,) + "\n",);
  writeFileSync(join(outDir, `targets-${day}.md`,), renderMarkdown(result,),);
  console.log(`RSI targets: ${result.counts.total} open, ${result.counts.humanReview} human-review`,);
}

if (import.meta.main) { main(); }
