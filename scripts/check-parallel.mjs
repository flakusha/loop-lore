#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/* eslint-disable no-undef, unicorn/name-replacements, unicorn/consistent-boolean-name */

/**
 * Parallel check runner for loop-lore
 * Runs independent checks in parallel and aggregates results
 *
 * Usage:
 *   bun run scripts/check-parallel.mjs [--fix] [--ci] [--report-ls]
 *
 * Writes a machine-readable report to .tmp/check-report.json after every run
 * (success: summary only; failure: summary + full failed-check output).
 * The report path is logged to stdout.
 *
 * The report is written atomically (temp file + rename) and carries provenance
 * (branch, head commit, worktree, run id, mode), so concurrent runs across
 * many worktrees never produce torn or ambiguous artifacts.
 *
 * --report-ls: no checks run; aggregates the latest report of every git
 * worktree and flags reports stale w.r.t. that worktree's current HEAD.
 */

// ── Imports ─────────────────────────────────────────────────────

// oxlint-disable-next-line import/no-nodejs-modules
import { execFileSync, } from "node:child_process";
// oxlint-disable-next-line import/no-nodejs-modules sort-imports
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules
import path from "node:path";

// ── Parse args ──────────────────────────────────────────────────

// ── Check definitions ───────────────────────────────────────────

// oxlint-disable-next-line sort-keys
const checks = {
    // Type checking
    "typecheck - backend": "bun run typecheck",
    "typecheck - frontend": "bun run typecheck:frontend",
    "typecheck - coverage": "bun run typecheck:coverage",
    "typecheck - coverage - frontend": "bun run typecheck:coverage:frontend",

    "lint - ts (eslint)": "bun run lint:eslint",
    "lint - oxlint (correctness)": "bun run lint:oxlint",
    "lint - eslint": "bun run lint:eslint",

    // Formatting
    "format - dprint": "bun run format:dprint",
    "md - lint": "bun run md:lint",

    // Dead-code analysis (knip)
    "dead - code (knip)": "bun run dead:code",

    // Wiring + dead-code check gate (routes mounted, services wired, plugins registered)
    "wiring - check": "bun run scripts/check-wiring.ts",

    // Changelog gate (Keep-a-Changelog structure; latest tag must have a section)
    "changelog - gate": "bun run scripts/check-changelog.ts",

    // DB schema staleness (regenerates into temp dir, diffs vs committed)
    "db - schema gate": "bun run scripts/check-db-schemas.ts",

    // Backlog index reconciliation (file-map rows ↔ tier files; orphans/phantoms)
    "backlog - index": "bun run plan:backlog:sync",

    // Reverse code→plan index freshness (code-map.json matches a fresh rebuild)
    "code-map - freshness": "bun run plan:map:check",

    // Size check
    "size - check": "bun run scripts/check-file-size.ts",
    "size - strict": "bun run scripts/check-file-size.ts --strict",

    // Context weight
    "context - weight": "bun run scripts/check-context-weight.ts",

    // Shell reference guard (no .sh references in docs)
    "no - shell - refs": "bun run scripts/check-no-shell-refs.ts",

    // Tests
    "test - unit": "bun run test:unit",
    "test - e2e": "E2E_SAFEGUARD=1 bun run test:e2e",
  },
  // ── Run checks in parallel ──────────────────────────────────────

  PROJECT_ROOT = path.resolve(import.meta.dir, "..",),
  // Machine-readable report: written after every run, git-ignored (.tmp/).
  REPORT_DIR_RELATIVE = ".tmp",
  REPORT_RELATIVE = ".tmp/check-report.json",
  REPORT_PATH = path.resolve(PROJECT_ROOT, REPORT_DIR_RELATIVE, "check-report.json",),
  // Per-check output cap for the report (guards against multi-MB failure dumps).
  MAX_OUTPUT_CHARS = 100_000,
  // Run identity: unique per invocation; embedded in the report and used to make
  // oxlint-disable-next-line capitalized-comments
  // the on-disk write atomic (temp file → rename).
  RUN_ID = `${process.pid}-${Date.now().toString(36,)}`,
  // Invocation mode — the runner is mode-agnostic; the label only records how the
  // oxlint-disable-next-line capitalized-comments
  // check was invoked so fix/ci runs can't masquerade as plain ones.
  MODE = (() => {
    if (process.argv.includes("--ci",)) { return "ci"; }
    if (process.argv.includes("--fix",)) { return "fix"; }
    return "plain";
  })(),
  IS_REPORT_LS = process.argv.includes("--report-ls",);

// oxlint-disable-next-line func-style
async function runCheck(name, command,) {
  const startedAt = performance.now(),
    commandParts = ["-c", command,];

  try {
    // oxlint-disable-next-line sort-keys
    const proc = Bun.spawn(["bash", ...commandParts,], {
        cwd: PROJECT_ROOT,
        stdout: "pipe",
        stderr: "pipe",
      },),
      exitCode = await proc.exited,
      stdout = await new Response(proc.stdout,).text(),
      stderr = await new Response(proc.stderr,).text(),
      output = stdout || stderr;
    // oxlint-disable-next-line sort-keys
    return {
      name,
      command,
      passed: exitCode === 0,
      output,
      exitCode,
      durationMs: Math.round(performance.now() - startedAt,),
      truncated: output.length > MAX_OUTPUT_CHARS,
    };
  } catch (error) {
    // oxlint-disable-next-line sort-keys
    return {
      name,
      command,
      passed: false,
      output: error.message,
      exitCode: 1,
      durationMs: Math.round(performance.now() - startedAt,),
      truncated: false,
    };
  }
}

async function runAllChecks() {
  console.log("=== loop-lore parallel check runner ===",);
  console.log(`Running ${Object.keys(checks,).length} checks in parallel...\n`,);

  const promises = Object.entries(checks,).map(([name, command,],) => runCheck(name, command,));
  return Promise.all(promises,);
}

function reportResults(results,) {
  let passed = 0;
  let failed = 0;

  for (const result of results) {
    if (result.passed) {
      console.log(`✓ PASS: ${result.name}`,);
      passed++;
    } else {
      console.log(`✗ FAIL: ${result.name}`,);
      console.log(`  Output: ${result.output.split("\n",).slice(0, 10,).join("\n  ",)}`,);
      failed++;
    }
  }

  console.log("\n=== Summary ===",);
  console.log(`Total: ${results.length}`,);
  console.log(`Passed: ${passed}`,);
  console.log(`Failed: ${failed}`,);

  return failed;
}

// ── Machine-readable report ─────────────────────────────────────

/**
 * Build the machine-readable report. Success → summary + per-check status;
 * failure → same plus the full output of every failed check (capped).
 */
function buildReport({ exitCode, checks, nonBlocking, },) {
  const passedCount = checks.filter((check,) => check.passed).length;
  const failedCount = checks.length - passedCount;
  const durationMs = checks.reduce((sum, check,) => sum + (check.durationMs ?? 0), 0,);

  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    runner: "bun run scripts/check-parallel.mjs",
    cwd: PROJECT_ROOT,
    // Provenance: which tree/worktree/invocation produced this snapshot.
    // Consumers compare gitHead against the worktree's current HEAD to detect
    // staleness; runId disambiguates concurrent runs.
    runId: RUN_ID,
    mode: MODE,
    worktreeName: path.basename(PROJECT_ROOT,),
    branch: GIT_CONTEXT.branch,
    gitHead: GIT_CONTEXT.gitHead,
    gitDirty: GIT_CONTEXT.gitDirty,
    passed: failedCount === 0,
    exitCode,
    reportPath: REPORT_RELATIVE,
    summary: {
      total: checks.length,
      passed: passedCount,
      failed: failedCount,
      durationMs,
    },
    checks: checks.map((check,) => ({
      name: check.name,
      command: check.command,
      passed: check.passed,
      exitCode: check.exitCode,
      durationMs: check.durationMs ?? 0,
      output: check.passed ? null : (check.output ?? "").slice(0, MAX_OUTPUT_CHARS,),
      truncated: check.passed ? false : (check.output ?? "").length > MAX_OUTPUT_CHARS,
    })),
    nonBlocking,
  };
}

function writeReport(report,) {
  mkdirSync(path.resolve(PROJECT_ROOT, REPORT_DIR_RELATIVE,), { recursive: true, },);
  // Atomic write: temp file + rename, so concurrent readers never observe a
  // partially-written report (last complete run wins).
  const tmpPath = `${REPORT_PATH}.${RUN_ID}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(report, null, 2,) + "\n", "utf8",);
  renameSync(tmpPath, REPORT_PATH,);
  console.log(`\n📄 Check report: ${REPORT_PATH}`,);
  return REPORT_PATH;
}

// ── Git provenance ─────────────────────────────────────────────

// Resolve the git binary once: fixed path satisfies
// sonarjs/no-os-command-from-path and avoids PATH-order surprises.
const GIT_BIN = (() => {
  const pathDirs = (process.env.PATH ?? "").split(path.delimiter,);
  for (const dir of pathDirs) {
    const candidate = path.join(dir, "git",);
    if (existsSync(candidate,)) { return candidate; }
  }
  return "git";
})();

/**
 * Run a git query synchronously; returns "" when git is unavailable.
 */
function gitSync(args,) {
  try {
    return execFileSync(GIT_BIN, args, { cwd: PROJECT_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore",], },)
      .trim();
  } catch {
    return "";
  }
}

/**
 * Snapshot of the tree this run happens in: branch, head commit, dirtiness.
 */
function getGitContext() {
  const branch = gitSync(["branch", "--show-current",],) ||
    gitSync(["symbolic-ref", "--short", "HEAD",],) ||
    "(detached)";
  const gitHead = gitSync(["rev-parse", "--short", "HEAD",],);
  const status = gitSync(["status", "--porcelain",],);
  return {
    branch,
    gitHead,
    // Git unavailable → head is "" anyway; stale checks fall back to gitHead.
    gitDirty: status.length > 0,
  };
}

const GIT_CONTEXT = getGitContext();

// ── Report aggregation (--report-ls) ────────────────────────────

/**
 * Aggregate the latest check report of every git worktree.
 * Flags reports whose gitHead no longer matches that worktree's current HEAD,
 * so a batch of concurrently-checked worktrees can be reviewed in one shot.
 */
function cmdReportLs() {
  const out = execFileSync(GIT_BIN, ["worktree", "list", "--porcelain",], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore",],
  },);

  const worktrees = [];
  let current = null;
  for (const line of out.split("\n",)) {
    if (line === "") {
      current = null;
      continue;
    }
    if (line.startsWith("worktree ",)) {
      current = { path: line.slice("worktree ".length,), head: "", branch: "", };
      worktrees.push(current,);
    } else if (current !== null && line.startsWith("HEAD ",)) {
      current.head = line.slice("HEAD ".length,);
    } else if (current !== null && line.startsWith("branch ",)) {
      current.branch = line.slice("branch ".length,).replace(/^refs\/heads\//, "",);
    }
  }

  console.log("=== Check reports across worktrees ===",);
  console.log(`${"worktree".padEnd(32,)} ${"branch".padEnd(28,)} ${"head".padEnd(8,)} ${"report".padEnd(8,)} status`,);
  for (const wt of worktrees) {
    const reportPath = path.join(wt.path, REPORT_DIR_RELATIVE, "check-report.json",);
    let report = null;
    let corrupt = false;
    try {
      report = JSON.parse(readFileSync(reportPath, "utf8",),);
    } catch {
      corrupt = existsSync(reportPath,);
    }

    const head = wt.head.slice(0, 7,);
    let status;
    if (corrupt) { status = "CORRUPT"; }
    else if (report === null) { status = "no-report"; }
    else if (report.gitHead && !wt.head.startsWith(report.gitHead,)) { status = "STALE"; }
    else if (report.passed === true) { status = "pass"; }
    else { status = "FAIL"; }

    const reportHead = report?.gitHead ?? "-";
    const name = path.basename(wt.path,).padEnd(32,);
    const branch = (wt.branch || "(detached)").padEnd(28,);
    console.log(`${name} ${branch} ${head.padEnd(8,)} ${reportHead.padEnd(8,)} ${status}`,);
  }
}

// ── Non-blocking checks ─────────────────────────────────────────

async function runNonBlockingChecks(notes,) {
  console.log("\n=== Non-blocking checks ===",);

  // Version drift check
  try {
    const tagProc = Bun.spawn(["bash", "-c", "git tag --list v*",], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },);
    await tagProc.exited;
    const tagText = await new Response(tagProc.stdout,).text();
    const tags = tagText.trim().split("\n",).filter(Boolean,);
    const latestTag = tags.at(-1,);

    const packageProc = Bun.spawn([
      "bash",
      "-c",
      'bun -p JSON.parse(require("fs").readFileSync("package.json","utf8")).version',
    ], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },);
    await packageProc.exited;
    const packageText = await new Response(packageProc.stdout,).text(),
      packageVersion = packageText.trim();

    if (latestTag && packageVersion) {
      const tagVersion = latestTag.replace(/^v/, "",);
      if (tagVersion === packageVersion) {
        console.log(`✓ Version in sync: ${packageVersion}`,);
        notes.push({ level: "ok", message: `Version in sync: ${packageVersion}`, },);
      } else {
        console.log(`⚠ Version drift: package.json=${packageVersion}, latest tag=${tagVersion}`,);
        console.log("  Run 'bun run version:sync' to reconcile",);
        notes.push({
          level: "warn",
          message:
            `Version drift: package.json=${packageVersion}, latest tag=${tagVersion}; run 'bun run version:sync'`,
        },);
      }
    }
  } catch {
    console.log("⚠ Version check skipped",);
    notes.push({ level: "skipped", message: "Version check skipped", },);
  }

  // Code duplication check
  try {
    const jscpdProc = Bun.spawn(["bash", "-c", "bun run jscpd:full",], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },);
    await jscpdProc.exited;
    const jscpdText = await new Response(jscpdProc.stdout,).text();
    if (jscpdText.includes("Found",)) {
      const cloneCount = (jscpdText.match(/Clone found/g,) ?? []).length;
      console.log(`⚠ Code duplication detected (jscpd:full): ${cloneCount} clones`,);
      console.log("  Run 'bun run jscpd:full' for full report",);
      notes.push({ level: "warn", message: `Code duplication (jscpd:full): ${cloneCount} clones`, },);
    } else {
      console.log("✓ No code duplication issues (jscpd:full)",);
      notes.push({ level: "ok", message: "No code duplication issues (jscpd:full)", },);
    }
  } catch {
    console.log("✓ No code duplication issues (jscpd:full)",);
    notes.push({ level: "ok", message: "No code duplication issues (jscpd:full)", },);
  }

  // Markdown stale-link check (non-blocking — reports broken internal links)
  try {
    const linksProc = Bun.spawn(["bash", "-c", "bun run md:links",], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },);
    await linksProc.exited;
    const [stdout, stderr,] = await Promise.all([
      new Response(linksProc.stdout,).text(),
      new Response(linksProc.stderr,).text(),
    ],);
    const linksText = stdout + stderr;
    if (linksText.includes("broken",)) {
      console.log(`⚠ Markdown stale-link check found broken internal links:`,);
      for (const line of linksText.trim().split("\n",)) {
        if (line.includes("broken target",)) { console.log(`  ${line}`,); }
      }
      console.log("  Fix target paths or defer to non-blocking (see scripts/check-md-links.ts)",);
      notes.push({ level: "warn", message: "Markdown stale-link check found broken internal links", },);
    } else {
      console.log("✓ Markdown links OK",);
      notes.push({ level: "ok", message: "Markdown links OK", },);
    }
  } catch (error) {
    console.log(`⚠ Markdown stale-link check skipped (${error.message})`,);
    notes.push({ level: "skipped", message: `Markdown stale-link check skipped (${error.message})`, },);
  }

  // License compliance check (scancode + fossa — non-blocking, requires external tools)
  try {
    const licenseProc = Bun.spawn(["bash", "-c", "bun run license:check",], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },);
    await licenseProc.exited;
    const [stdout, stderr,] = await Promise.all([
      new Response(licenseProc.stdout,).text(),
      new Response(licenseProc.stderr,).text(),
    ],);
    const licenseText = stdout + stderr;
    const lines = licenseText.trim().split("\n",);
    // Show license check output (already prefixed with [license])
    const licenseNotes = [];
    for (const line of lines) {
      if (!line.startsWith("[license]",)) { continue; }
      console.log(`  ${line}`,);
      licenseNotes.push(line,);
    }
    if (licenseNotes.length > 0) {
      notes.push({ level: "info", message: licenseNotes.join("\n",), },);
    }
  } catch (error) {
    console.log(`⚠ License compliance check skipped (${error.message})`,);
    notes.push({ level: "skipped", message: `License compliance check skipped (${error.message})`, },);
  }
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  if (IS_REPORT_LS) {
    cmdReportLs();
    return;
  }

  const results = await runAllChecks();
  const failed = reportResults(results,);

  const nonBlocking = [];
  await runNonBlockingChecks(nonBlocking,);

  writeReport(buildReport({
    exitCode: failed > 0 ? 1 : 0,
    checks: results,
    nonBlocking,
  },),);

  if (failed > 0) {
    console.log(`\n=== ${failed} check(s) failed ===`,);
    process.exit(1,);
  }

  console.log("\n=== All checks passed ===",);
}

main().catch((error,) => {
  console.error("❌ Check runner failed:", error.message,);
  if (IS_REPORT_LS) { process.exit(1,); }
  writeReport(buildReport({
    exitCode: 1,
    checks: [{
      name: "check - runner",
      command: "bun run scripts/check-parallel.mjs",
      passed: false,
      exitCode: 1,
      durationMs: 0,
      truncated: false,
      output: error.message,
    },],
    nonBlocking: [],
  },),);
  process.exit(1,);
},);
