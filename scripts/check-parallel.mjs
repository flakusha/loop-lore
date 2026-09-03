#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Parallel check runner for loop-lore
 * Runs independent checks in parallel and aggregates results
 *
 * Usage:
 *   bun run scripts/check-parallel.mjs [--fix] [--ci] [--report-ls] [--jobs N]
 *
 * Concurrency cap (added to keep peak RSS sane across multiple worktrees):
 *   --jobs N    Override per-run concurrency cap (default: CHECK_JOBS env, or 4).
 *   CHECK_JOBS  Env override for the same value. The cap controls how many
 *               checks run in parallel; the script still launches all checks,
 *               but processes them in chunks of `jobs` at a time. With the
 *               default (4), peak RSS per run drops to roughly 1/6 of the
 *               historical `Promise.all`-everything behaviour, which lets
 *               2 worktrees share a 64GB host without OOM.
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
// oxlint-disable-next-line import/no-nodejs-modules
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules
import path from "node:path";

// GPG pre-flight: ensure the agent's signing key is unlocked before any
// check subprocess spawns, so a downstream `git commit` against a cold
// cache never hangs on a pinentry prompt. Imports the same prolong/warm
// helpers the human-facing `scripts/gpg-unlock.mjs` uses.
import { prolongCachedPassphrase, warmCache, } from "./gpg-unlock.mjs";

// ── Parse args ──────────────────────────────────────────────────

// ── Check definitions ───────────────────────────────────────────

// oxlint-disable-next-line sort-keys
const checks = {
    // Type checking
    "typecheck - backend": "bun run typecheck",
    "typecheck - frontend": "bun run typecheck:frontend",
    "typecheck - coverage": "bun run typecheck:coverage",
    "typecheck - coverage - frontend": "bun run typecheck:coverage:frontend",

    // ESLint (single canonical entry — duplicate "lint - ts (eslint)" removed;
    // running ESLint twice doubled its 1.5GB RSS peak with no new signal.)
    "lint - eslint": "bun run lint:eslint",
    // oxlint gate is advisory: tsc + eslint already cover real correctness,
    // and oxlint reports thousands of style warnings that don't fail other gates.
    "lint - oxlint (correctness)": "bun run lint:oxlint:advisory",

    // Formatting
    "format - dprint": "bun run format",
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

    // Ticket index reconciliation (index.json ↔ .md ↔ git issues)
    "plan - ticket index (sync)": "bun run plan:sync",

    // Size check
    "size - check": "bun run scripts/check-file-size.ts",
    // size - strict: re-enabled — files over 250L need splitting (recent additions)
    "size - strict": "bun run scripts/check-file-size.ts --strict",
    // Context weight
    "context - weight": "bun run scripts/check-context-weight.ts",

    // Shell reference guard (no .sh references in docs)
    "no - shell - refs": "bun run scripts/check-no-shell-refs.ts",

    // Tests
    "test - unit": "bun run test:unit",
    "test - e2e": "E2E_SAFEGUARD=1 bun run test:e2e",

    // Frontend security + hygiene gates (promoted from .tmp investigation scripts)
    // Blocking: unescaped server-derived data in innerHTML is a stored-XSS vector.
    "frontend - innerHTML xss": "bun run scripts/check-frontend-innerhtml-xss.ts",
    // Advisory: reports pre-existing banned-pattern debt; not blocking.
    "frontend - banned patterns (ESLint-gap heuristic, advisory)":
      "bun run scripts/check-frontend-banned-patterns.ts || true",
    // Advisory: planning hygiene — stale/missing epic coverage.
    "plan - epic coverage (advisory)": "bun run scripts/check-epic-coverage.ts || true",
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

// ── GPG pre-flight ──────────────────────────────────────────────
// Tracks the cache state for provenance in the report. Shape:
// `cold` means we exited before any check ran — the report will reflect
// that via `exitCode: 1` from the cold-cache exit path below.
let GPG_PRECHECK_STATE = null;

/**
 * Pre-flight: ensure the agent's GPG key is unlocked before any check
 * subprocess starts. Under `--ci` (or any non-TTY invocation) we cannot
 * block on a pinentry prompt, so we prolong-only via `PRESET_PASSPHRASE`
 * and refuse to start on cold cache. Under `--plain` / `--fix` on a TTY,
 * a cold cache falls back to the loopback pinentry inherited from the
 * parent terminal — the operator answers once and the cache stays warm
 * for the rest of the run.
 */
async function ensureGpgWarm() {
  // Dev/sandbox escape hatch: `CHECK_SKIP_GPG_PRECHECK=1` runs the gate
  // anyway (still no-op on the GPG side). Useful for `bun run check` in
  // worktrees without `.credentials.env` and for CI environments that
  // pre-stage credentials out of band. The provenance field reflects the
  // bypass so reviewers see a `state: "skipped"` report.
  if (process.env.CHECK_SKIP_GPG_PRECHECK === "1") {
    console.log("gpg-precheck: skipped (CHECK_SKIP_GPG_PRECHECK=1)",);
    GPG_PRECHECK_STATE = { state: "skipped", };
    return;
  }
  const credentialsPath = path.resolve(PROJECT_ROOT, ".credentials.env",);
  if (!existsSync(credentialsPath,)) {
    console.error("hint: gpg-no-credentials",);
    console.error(`.credentials.env not found at ${credentialsPath}`,);
    console.error("  Copy .credentials.env.example and fill in AGENT_GPG_KEY_ID/NAME/EMAIL.",);
    GPG_PRECHECK_STATE = { state: "cold", reason: "no-credentials", };
    process.exit(1,);
  }
  const content = readFileSync(credentialsPath, "utf-8",);
  const m = /^AGENT_GPG_KEY_ID\s*=\s*["']?([^"'\n]*)["']?/m.exec(content,);
  const keyId = m?.[1]?.trim().replaceAll(/^["']|["']$/g, "",) ?? "";
  if (!keyId) {
    console.error("hint: gpg-no-key-id",);
    console.error("AGENT_GPG_KEY_ID not set in .credentials.env",);
    GPG_PRECHECK_STATE = { state: "cold", reason: "no-key-id", };
    process.exit(1,);
  }
  // Step 1: try to prolong (silent, no prompt).
  const prolonged = await prolongCachedPassphrase(keyId,);
  if (prolonged.ok) {
    console.log(`gpg-precheck: warm (TTL ${prolonged.maxTtl}s, key ${keyId.slice(0, 8,)}...)`,);
    GPG_PRECHECK_STATE = { state: "warm", maxTtl: prolonged.maxTtl, };
    return;
  }
  // Step 2: distinguish "agent config gap" from "genuine cold cache".
  //   `preset-unsupported` means the agent can't accept PRESET_PASSPHRASE
  //   (no `allow-preset-passphrase` in gpg-agent.conf). The cache MAY still
  //   be warm from a prior session — prolong just can't refresh its TTL.
  //   Don't kill the gate over a config gap the user owns.
  if (prolonged.reason === "preset-unsupported") {
    console.log(`gpg-precheck: prolong unavailable (${prolonged.reason}); trusting agent cache as-is.`,);
    GPG_PRECHECK_STATE = { state: "warm", reason: prolonged.reason, };
    return;
  }
  const isCi = MODE === "ci" || !process.stdout.isTTY;
  if (isCi) {
    console.error("hint: gpg-cold-cache",);
    console.error(`GPG agent does not have ${keyId} unlocked.`,);
    console.error(`Run: bun run scripts/gpg-unlock.mjs`,);
    GPG_PRECHECK_STATE = { state: "cold", reason: prolonged.reason ?? "preset-rejected", };
    process.exit(1,);
  }
  console.error(`gpg-precheck: cold (${prolonged.reason}); warming via loopback pinentry...`,);
  const warmed = await warmCache(keyId,);
  if (!warmed) {
    console.error("hint: gpg-cold-cache",);
    console.error(`Failed to warm GPG cache for ${keyId}.`,);
    console.error(`Run: bun run scripts/gpg-unlock.mjs`,);
    GPG_PRECHECK_STATE = { state: "cold", reason: "warm-failed", };
    process.exit(1,);
  }
  GPG_PRECHECK_STATE = { state: "warm", maxTtl: undefined, };
}

// ── Concurrency cap ────────────────────────────────────────────
// Resolve the per-run concurrency cap with priority: --jobs flag > CHECK_JOBS
// env > default 4. We refuse values < 1 (would deadlock) and cap at the check
// count to avoid the Promise.all-of-empty-array footgun. The cap exists so
// multiple worktrees can run `bun run check` simultaneously without the host
// hitting OOM — peak RSS scales ~linearly with concurrent checks.
const DEFAULT_JOBS = 4;
function parseJobs() {
  const flagIdx = process.argv.indexOf("--jobs",);
  let raw;
  if (flagIdx !== -1 && flagIdx + 1 < process.argv.length) {
    raw = process.argv[flagIdx + 1];
  } else if (process.env.CHECK_JOBS !== undefined) {
    raw = process.env.CHECK_JOBS;
  } else {
    raw = `${DEFAULT_JOBS}`;
  }
  const parsed = Number.parseInt(raw, 10,);
  if (!Number.isFinite(parsed,) || parsed < 1) {
    console.error(
      `⚠ Invalid --jobs/CHECK_JOBS value ${JSON.stringify(raw,)}; falling back to ${DEFAULT_JOBS}.`,
    );
    return DEFAULT_JOBS;
  }
  return parsed;
}
const JOBS = Math.min(parseJobs(), Object.keys(checks,).length,);

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
  const entries = Object.entries(checks,);
  const total = entries.length;
  console.log("=== loop-lore parallel check runner ===",);
  console.log(
    `Running ${total} checks with concurrency=${JOBS} (override via --jobs N or CHECK_JOBS=N)...\n`,
  );
  // Cap the number of in-flight checks at JOBS. We schedule chunks of size
  // JOBS and await each chunk before starting the next; this keeps peak
  // RSS roughly bounded at JOBS × max-check-RSS instead of total × max-check-RSS.
  // Order is preserved per chunk so the report's per-check duration numbers
  // remain comparable across runs (the slowest check sits in the final chunk).
  //
  // We use `Promise.allSettled` rather than `Promise.all`: `runCheck` already
  // catches every check-level error into a `{ passed: false, output, ... }`
  // result object, so no promise should reject — but `allSettled` keeps the
  // chunk resilient to any future check that forgets its try/catch, and
  // makes the per-chunk invariant explicit (collect every result, no early
  // short-circuit on a single failure).
  const results = [];
  for (let offset = 0; offset < total; offset += JOBS) {
    const chunk = entries.slice(offset, offset + JOBS,);
    const chunkResults = await Promise.allSettled(
      chunk.map(([name, command,],) => runCheck(name, command,)),
    );
    for (const settled of chunkResults) {
      if (settled.status === "fulfilled") {
        results.push(settled.value,);
        continue;
      }
      // `rejected` branch: `runCheck` catches every check-level error into
      // a `{ passed: false, output, ... }` result, so a rejection here means
      // a bug in `runCheck` itself (uncaught throw from `Bun.spawn` setup,
      // stream read, etc.). Synthesize a failing result so the rest of the
      // run can complete and the report still shows the anomaly.
      const reason = settled.reason;
      const message = reason instanceof Error
        ? `${reason.message}\n${reason.stack ?? ""}`
        : String(reason,);
      results.push({
        name: "(runner error)",
        command: "(see stack trace)",
        passed: false,
        exitCode: 1,
        output: message,
        durationMs: 0,
        truncated: false,
      },);
    }
  }
  return results;
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
function buildReport({ exitCode, checks, nonBlocking, gpgPrecheck, },) {
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
    // Cache state at run start. `cold` + exitCode !== 0 means the runner
    // refused to start — re-run after `bun run scripts/gpg-unlock.mjs`.
    gpgPrecheck: gpgPrecheck ?? null,
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

  // Code duplication check (jscpd:full) — parses the JSON report the script
  // writes to .tmp/jscpd/; falls back to counting console "Clone found" lines
  // only when the report is missing/corrupt. Advisory (never blocking), but
  // reports clone count + duplicated-lines % and records clones in
  // .tmp/jscpd/prev.json so the next run can show a regression trend.
  try {
    const jscpdProc = Bun.spawn(["bash", "-c", "bun run jscpd:full",], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },);
    await jscpdProc.exited;
    const jscpdText = await new Response(jscpdProc.stdout,).text();
    const jscpdDir = path.resolve(PROJECT_ROOT, ".tmp/jscpd",);
    let cloneCount = null;
    let pctText = "";
    try {
      const report = JSON.parse(
        readFileSync(path.resolve(jscpdDir, "jscpd-report.json",), "utf8",),
      );
      cloneCount = report.duplicates.length;
      const formats = Object.values(report.statistics?.formats ?? {},);
      const dupLines = formats.reduce((sum, f,) => sum + f.duplicatedLines, 0,);
      const allLines = formats.reduce((sum, f,) => sum + f.lines, 0,);
      pctText = allLines > 0 ? `, ${(100 * dupLines / allLines).toFixed(2,)}% dup lines` : "";
    } catch {
      cloneCount = (jscpdText.match(/Clone found/g,) ?? []).length;
    }
    let trend = " (first run: baseline recorded)";
    const prevPath = path.resolve(jscpdDir, "prev.json",);
    try {
      const prev = JSON.parse(readFileSync(prevPath, "utf8",),);
      const delta = cloneCount - prev.clones;
      trend = delta === 0
        ? " (unchanged vs last run)"
        : delta > 0
        ? ` (+${delta} clones vs last run ⚠)`
        : ` (${delta} clones vs last run ✓)`;
    } catch {
      // no previous report in this checkout — baseline gets recorded below
    }
    mkdirSync(jscpdDir, { recursive: true, },);
    writeFileSync(
      prevPath,
      `${JSON.stringify({ clones: cloneCount, generatedAt: new Date().toISOString(), },)}\n`,
      "utf8",
    );
    if (cloneCount > 0) {
      console.log(`⚠ Code duplication detected (jscpd:full): ${cloneCount} clones${pctText}${trend}`,);
      console.log("  Full report: .tmp/jscpd/jscpd-report.json",);
      notes.push({
        level: "warn",
        message: `Code duplication (jscpd:full): ${cloneCount} clones${pctText}${trend}`,
      },);
    } else {
      console.log("✓ No code duplication issues (jscpd:full)",);
      notes.push({ level: "ok", message: "No code duplication issues (jscpd:full)", },);
    }
  } catch (error) {
    console.log("⚠ Code duplication check skipped (jscpd run failed)",);
    notes.push({
      level: "skipped",
      message: `Code duplication check skipped: ${error.message}`,
    },);
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

  // GPG pre-flight: prolong cached passphrase if warm, warm the cache via
  // loopback pinentry if cold (TTY mode), or refuse to start in --ci. This
  // must run before any check subprocess so a downstream `git commit`
  // against a cold cache never hangs on a pinentry prompt the harness
  // can't answer.
  await ensureGpgWarm();

  const results = await runAllChecks();
  const failed = reportResults(results,);

  const nonBlocking = [];
  await runNonBlockingChecks(nonBlocking,);

  writeReport(buildReport({
    exitCode: failed > 0 ? 1 : 0,
    checks: results,
    nonBlocking,
    gpgPrecheck: GPG_PRECHECK_STATE,
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
    gpgPrecheck: GPG_PRECHECK_STATE,
  },),);
  process.exit(1,);
},);
