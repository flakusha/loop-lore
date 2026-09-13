// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Report command — aggregate check-report status across worktrees
 */

import { existsSync, } from "fs";
import { readdir, readFile, } from "fs/promises";
import { resolve, } from "path";
import { type WorktreeConfig, } from "../utils/config";
import { colorize, log, section, } from "../utils/output";

interface CheckReport {
  branch: string;
  gitHead: string;
  runId: string;
  mode: string;
  gates: Record<string, { status: string }>;
  passed: boolean;
  timestamp: string;
}

function formatStatus(status: string,): string {
  switch (status) {
    case "passed":
      return colorize("passed", "green",);
    case "failed":
      return colorize("failed", "red",);
    case "skipped":
      return colorize("~ skipped", "yellow",);
    default:
      return colorize(`? ${status}`, "gray",);
  }
}

/**
 * Parse and validate raw check-report JSON.
 * Throws a descriptive Error when the payload is not parseable
 * or is missing the sections the renderer needs.
 */
function parseReport(raw: string,): CheckReport {
  const parsed: unknown = JSON.parse(raw,);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed,)) {
    throw new Error("report root is not a JSON object",);
  }
  if (!("gates" in parsed)) {
    throw new Error("missing or invalid 'gates' section",);
  }
  const gates: unknown = parsed.gates;
  if (typeof gates !== "object" || gates === null || Array.isArray(gates,)) {
    throw new Error("missing or invalid 'gates' section",);
  }
  // Narrowed: root object with object-typed `gates`; scalars are display-only.
  const report: CheckReport = parsed as CheckReport;
  return report;
}

function printReportRow(name: string, report: CheckReport,): void {
  const overall = report.passed ? colorize("PASSED", "green",) : colorize("FAILED", "red",);
  console.log(`  ${colorize(name, "cyan",)} ${overall} - ${report.branch} @ ${report.gitHead}`,);
  console.log(`    run: ${report.runId} | mode: ${report.mode} | ${report.timestamp}`,);
  for (const [gate, result,] of Object.entries(report.gates,)) {
    console.log(`    ${gate}: ${formatStatus(result.status,)}`,);
  }
  console.log("",);
}

function printMalformedRow(name: string, error: unknown,): void {
  const message = error instanceof Error ? error.message : String(error,);
  console.log(`  ${colorize(name, "cyan",)} ${colorize("malformed report", "red",)} - ${message}`,);
}

/**
 * List check-report status for the main repo and every worktree.
 * A missing report prints a "no report" row; an unreadable or
 * malformed report prints a "malformed report" row — one bad
 * report never aborts the listing.
 *
 * @param _args Unused CLI args.
 * @param config Worktree configuration with repo root and tree dir.
 * @returns Resolves when the listing is printed.
 */
export async function report(
  _args: string[],
  config: WorktreeConfig,
): Promise<void> {
  section("Check reports across worktrees",);

  // Check main repo
  const mainReportPath = resolve(config.repoRoot, ".tmp", "check-report.json",);
  if (existsSync(mainReportPath,)) {
    try {
      const raw = await readFile(mainReportPath, "utf-8",);
      printReportRow("(main)", parseReport(raw,),);
    } catch (error) {
      printMalformedRow("(main)", error,);
    }
  } else {
    console.log(`  ${colorize("(main)", "cyan",)} ${colorize("no report", "gray",)}`,);
    console.log("",);
  }

  // Check worktrees
  if (!existsSync(config.treeDir,)) {
    log("info", "No tree/ directory found",);
    return;
  }

  const entries = await readdir(config.treeDir, { withFileTypes: true, },);
  const worktrees = entries.filter(e => e.isDirectory());

  for (const wt of worktrees) {
    const reportPath = resolve(config.treeDir, wt.name, ".tmp", "check-report.json",);
    if (!existsSync(reportPath,)) {
      console.log(`  ${colorize(wt.name, "cyan",)} ${colorize("no report", "gray",)}`,);
      continue;
    }

    try {
      const raw = await readFile(reportPath, "utf-8",);
      printReportRow(wt.name, parseReport(raw,),);
    } catch (error) {
      printMalformedRow(wt.name, error,);
      continue;
    }
  }
}
