// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Lane-ticket linkage gate: every lane-scoped ticket keeps ONE canonical id
 * (filename slug ↔ H1 ↔ index extid), and every LANE-*.md claim resolves.
 *
 * Drift is an ERROR (exit 1) — the id is threaded through lane files,
 * ticket files, the index, and git issues, and silent divergence breaks
 * navigation. Unresolvable lane claims are WARNINGS (exit 0): many lanes
 * are historical and outlive the tickets they cite.
 *
 * Usage:
 *   bun run plan:linkage   # report linkage; fail on drift, warn on lanes
 */

import { join, } from "node:path";
import { type LinkageReport, linkageReport, } from "./plan-entry-map.js";

const ROOT = join(import.meta.dir, "..",);
const TICKETS_DIR = join(ROOT, ".plan", "tickets",);
const LANES_DIR = join(ROOT, ".tmp", "intercom",);
const INDEX_PATH = join(TICKETS_DIR, "index.json",);

/** Report lines and exit code for a linkage report — pure, tested. */
export function linkageVerdict(report: LinkageReport,): { lines: string[]; exitCode: number } {
  const lines = [`scoped tickets: ${report.scoped.length}`, `lanes: ${report.lanes.length}`,];
  for (const warn of report.warnings) { lines.push(`warning: ${warn}`,); }
  for (const drift of report.drifts) {
    for (const problem of drift.problems) { lines.push(`drift: ${drift.file}: ${problem}`,); }
  }
  const bound = report.scoped.filter((t,) => t.indexTitle !== null).length;
  lines.push(`${bound} scoped tickets bound to the index`,);
  return { lines, exitCode: report.drifts.length > 0 ? 1 : 0, };
}

function main(): void {
  const verdict = linkageVerdict(linkageReport(TICKETS_DIR, LANES_DIR, INDEX_PATH,),);
  for (const line of verdict.lines) {
    if (line.startsWith("warning:",) || line.startsWith("drift:",)) { console.error(line,); }
    else { console.log(line,); }
  }
  process.exit(verdict.exitCode,);
}

if (import.meta.main) { main(); }
