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
      return colorize("✓ passed", "green",);
    case "failed":
      return colorize("✗ failed", "red",);
    case "skipped":
      return colorize("~ skipped", "yellow",);
    default:
      return colorize(`? ${status}`, "gray",);
  }
}

export async function report(
  _args: string[],
  config: WorktreeConfig,
): Promise<void> {
  section("Check reports across worktrees",);

  // Check main repo
  const mainReportPath = resolve(config.repoRoot, ".tmp", "check-report.json",);
  if (existsSync(mainReportPath,)) {
    const raw = await readFile(mainReportPath, "utf-8",);
    const report: CheckReport = JSON.parse(raw,);
    const overall = report.passed ? colorize("PASSED", "green",) : colorize("FAILED", "red",);
    console.log(`  ${colorize("(main)", "cyan",)} ${overall} — ${report.branch} @ ${report.gitHead}`,);
    console.log(`    run: ${report.runId} | mode: ${report.mode} | ${report.timestamp}`,);
    for (const [gate, result,] of Object.entries(report.gates,)) {
      console.log(`    ${gate}: ${formatStatus(result.status,)}`,);
    }
    console.log("",);
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
      const report: CheckReport = JSON.parse(raw,);
      const overall = report.passed ? colorize("PASSED", "green",) : colorize("FAILED", "red",);
      console.log(`  ${colorize(wt.name, "cyan",)} ${overall} — ${report.branch} @ ${report.gitHead}`,);
      console.log(`    run: ${report.runId} | mode: ${report.mode} | ${report.timestamp}`,);
      for (const [gate, result,] of Object.entries(report.gates,)) {
        console.log(`    ${gate}: ${formatStatus(result.status,)}`,);
      }
      console.log("",);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error,);
      console.log(`  ${colorize(wt.name, "cyan",)} ${colorize("malformed report", "red",)} — ${message}`,);
      continue;
    }
  }
}
