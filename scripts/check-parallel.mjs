#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Parallel check runner for loop-lore
 * Runs independent checks in parallel and aggregates results
 *
 * Usage:
 *   bun run scripts/check-parallel.mjs [--fix] [--ci] [--report-ls] [--jobs N]
 *   bun run scripts/check-parallel.mjs [--diff-base <ref>] [--gates <csv>] [--skip-gates <csv>]
 *
 * Concurrency cap (added to keep peak RSS sane across multiple worktrees):
 *   --jobs N    Override per-run concurrency cap (default: CHECK_JOBS env, or 1).
 *   CHECK_JOBS  Env override for the same value. The cap controls how many
 *               checks run in parallel; the script still launches all checks,
 *               but processes them in chunks of `jobs` at a time. The default
 *               of 1 is serial: agents finalize worktrees concurrently, and
 *               co-scheduled gates OOM-killed this host (observed kills when a
 *               second worktree ran its own heavy gates at the same time).
 *               Raise it with --jobs N / CHECK_JOBS=N when you want a faster
 *               run and know the box has the headroom to spare.
 *
 * Per-gate timeout (every gate is bounded; the child is killed on expiry):
 *   Default   15 min -- DEFAULT_GATE_TIMEOUT_MS in scripts/check/gate-timeout.mjs.
 *   Per gate  GATE_TIMEOUT_MS below names the gates that need a longer budget;
 *             every other gate gets the default.
 *   Env       CHECK_GATE_TIMEOUT_MS=<ms> raises the default (slow hosts, loaded
 *             CI runners) with no code change. An explicit per-gate budget wins
 *             over the env value.
 *   On expiry the gate's whole process group gets SIGTERM, then SIGKILL after a
 *             5s grace, so workers the gate forked die with it. The gate is
 *             reported FAILED with a message naming the gate and its budget in
 *             ms, appended to the output so report clipping cannot drop it, and
 *             the report entry carries `timedOut: true`.
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
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules
import path from "node:path";

// GPG pre-flight: ensure the agent's signing key is unlocked before any
// check subprocess spawns, so a downstream `git commit` against a cold
// cache never hangs on a pinentry prompt. Imports the same probe/warm
// helpers the human-facing `scripts/gpg-unlock.mjs` uses.
import {
  effectiveCacheTtl,
  passphraseSource,
  probeCachedPassphrase,
  warmCacheViaPassphrase,
  warmCacheViaPinentry,
} from "./gpg-unlock.mjs";

// Bounded gate execution: every spawned gate has a deadline, so a wedged child
// is killed and reported as failed instead of hanging the aggregate
// (BUG-parallel-check-runner-has-no-per-gate-timeout).
import {
  DEFAULT_GATE_TIMEOUT_MS,
  runGateWithTimeout,
} from "./check/gate-timeout.mjs";

// ── Parse args ──────────────────────────────────────────────────

// ── Check definitions ───────────────────────────────────────────

// ── Diff-scoped mode ────────────────────────────────────────────
const DIFF_ROOT = path.resolve(import.meta.dir, "..",);
// `--diff-base <ref>` scopes the expensive test gates to the branch diff
// (lint-staged style): only test files adjacent to changed source files run
// under `test - unit`, and the coverage gate gates only modules touched by
// the diff. Static/whole-project gates (typecheck, db schema, dead:code, …)
// are unchanged — they are cheap or inherently project-wide.
function parseDiffBase() {
  const idx = process.argv.indexOf("--diff-base",);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  return null;
}

const DIFF_BASE = parseDiffBase();

// ── Selective gate filter ──────────────────────────────────────
// `--gates=<csv>` runs ONLY the named checks (whitelist).
// `--skip-gates=<csv>` runs every check EXCEPT the named ones (inverse).
// Both flags take a comma-separated list of gate names — exactly the keys
// of the `checks` dictionary below. Names match verbatim after trimming
// whitespace; unknown names exit non-zero with a hint listing available
// names. The flag is the source of truth (trust semantics): no implicit
// inclusion of diff-scoped gates. Combined with `--diff-base`, the
// test/coverage entries still scope to the diff; `--gates` only narrows
// the executed subset.
function parseGateFlag(flag,) {
  const idx = process.argv.indexOf(flag,);
  if (idx === -1 || idx + 1 >= process.argv.length) { return null; }
  const raw = process.argv[idx + 1];
  if (raw === undefined || raw.trim() === "") { return null; }
  return raw.split(",",).map((s,) => s.trim()).filter((s,) => s.length > 0);
}
const GATES_FILTER = parseGateFlag("--gates",);
const SKIP_GATES_FILTER = parseGateFlag("--skip-gates",);
if (GATES_FILTER && SKIP_GATES_FILTER) {
  console.error("error: --gates and --skip-gates are mutually exclusive",);
  process.exit(2,);
}

/**
 * Files changed on this branch vs `base`, plus uncommitted working-tree
 * changes. Empty when `base` is null.
 * @param base - Git ref to diff against, or null.
 * @returns Sorted list of changed paths (repo-relative).
 */
function changedFiles(base,) {
  if (!base) { return []; }
  const mergeBase = execFileSync(
    "git",
    ["merge-base", base, "HEAD",],
    { cwd: DIFF_ROOT, encoding: "utf8", },
  ).trim();
  const committed = execFileSync(
    "git",
    ["diff", "--name-only", mergeBase,],
    { cwd: DIFF_ROOT, encoding: "utf8", },
  );
  const dirty = execFileSync(
    "git",
    ["diff", "--name-only", "HEAD",],
    { cwd: DIFF_ROOT, encoding: "utf8", },
  );
  return [...new Set(`${committed}\n${dirty}`.split("\n",).map((f,) => f.trim()).filter(Boolean,),),].sort();
}

/**
 * Test files to run for a diff-scoped check: changed `*.test.ts` files plus
 * the co-located test files of changed source files
 * (`src/foo/bar.ts` → `src/foo/bar.test.ts` when it exists).
 * @param files - Changed paths.
 * @returns Test file paths that exist on disk.
 */
function scopedTestFiles(files,) {
  const out = new Set();
  for (const f of files) {
    // Existence check applies to BOTH branches: a deleted `foo.test.ts` is
    // still "changed" in the diff, and passing the missing path to
    // `bun test` fails the gate with a filter error.
    if (f.endsWith(".test.ts",) && existsSync(path.resolve(DIFF_ROOT, f,),)) {
      out.add(f,);
      continue;
    }
    if (!f.startsWith("src/",) || !f.endsWith(".ts",)) { continue; }
    const testPath = f.replace(/\.ts$/, ".test.ts",);
    if (existsSync(path.resolve(DIFF_ROOT, testPath,),)) {
      out.add(testPath,);
    }
  }
  return [...out,];
}

/**
 * Top-level `src/` modules touched by the changed files
 * (`src/chat/service/x.ts` → `chat`). Feeds the coverage gate's `--only`.
 * @param files - Changed paths.
 * @returns Sorted unique module names, or null when nothing under src/ changed.
 */
function changedModules(files,) {
  const mods = new Set();
  for (const f of files) {
    if (f.startsWith("src/",)) {
      mods.add(f.split("/",)[1],);
      continue;
    }
    // Top-level files and tests/ trees map to their own module name so the
    // coverage gate's `--only` never ends up empty when test files changed
    // (an empty --only disables the filter and floors every module against
    // a partial lcov — guaranteed false red).
    mods.add(f.split("/",)[0],);
  }
  return mods.size > 0 ? [...mods,].sort() : null;
}
/**
 * Whether a directory tree contains at least one bun test file. A module
 * dir can exist without tests (`src/scripts/` holds helpers, no tests);
 * passing such a dir to `bun test` fails the run ("filters did not match
 * any test files"), so the coverage gate must skip test-less modules.
 * @param dir - Absolute directory path.
 * @returns True when a `*.test.ts` file exists anywhere under `dir`.
 */
function dirHasTests(dir,) {
  for (const entry of readdirSync(dir, { withFileTypes: true, },)) {
    const full = path.join(dir, entry.name,);
    if (entry.isDirectory()) {
      if (dirHasTests(full,)) { return true; }
    } else if (entry.isFile() && entry.name.endsWith(".test.ts",)) {
      return true;
    }
  }
  return false;
}
/**
 * Test paths for the scoped coverage gate: every test under each touched
 * top-level `src/` module. Adjacent-files scoping (see `scopedTestFiles`)
 * stays for the unit gate (fast signal); coverage needs module breadth to
 * meaningfully floor a module.
 * @param files - Changed paths.
 * @returns Existing `src/<mod>` dirs that contain tests, sorted.
 */
function scopedCoveragePaths(files,) {
  const mods = changedModules(files,) ?? [];
  return mods
    .map((m,) => `src/${m}`)
    .filter((p,) => {
      const abs = path.resolve(DIFF_ROOT, p,);
      // Guard: a top-level changed FILE (e.g. `.gitignore`) maps to a
      // same-named `src/<file>` path that may exist as a file — scandir on
      // it throws ENOTDIR, crashing the whole scoped run.
      return statSync(abs, { throwIfNoEntry: false, },)?.isDirectory() === true &&
        dirHasTests(abs,);
    },);
}

const CHANGED = changedFiles(DIFF_BASE,);
const SCOPED_TESTS = scopedTestFiles(CHANGED,);
const SCOPED_COVERAGE_PATHS = scopedCoveragePaths(CHANGED,);
// BUG-37a3763: floor diff-touched FILES, not whole modules — a scoped lcov
// only contains files the scoped tests loaded, so module aggregates are
// structurally unpassable. Test files and non-src trees are excluded (no
// meaningful per-file line coverage; non-src paths are unmeasured SKIPs).
const SCOPED_DIFF_SRC_FILES = (DIFF_BASE ? CHANGED : [])
  .filter((f,) => f.startsWith("src/",) && f.endsWith(".ts",) && !f.endsWith(".test.ts",));
const NOOP_OK = "true # diff-scope: no matching files";

// oxlint-disable-next-line sort-keys
const checks = {
    // Type checking
    "typecheck - backend": "bun run typecheck",
    "typecheck - frontend": "bun run typecheck:frontend",
    "typecheck - coverage": "bun run typecheck:coverage",
    "typecheck - coverage - frontend": "bun run typecheck:coverage:frontend", // 95% floor each (re-enabled after TS5.9 unblock; type-coverage-core uses ts.SyntaxKind.Unknown, TS7-incompatible)
    // BUG-typecheck-scripts-worktree-referenceerror-class-bugs-ship-gr:
    // scripts/worktree CLI ships outside tsconfig.backend.json (src/** only).
    // Scoped tsconfig.scripts.json relaxes strict debt but keeps name
    // resolution so unimported identifiers (TS2304/TS2552 ReferenceError
    // class) fail the gate instead of crashing at runtime.
    "typecheck - scripts": "bunx tsgo --noEmit -p tsconfig.scripts.json",
    // ESLint (single canonical entry — duplicate "lint - ts (eslint)" removed;
    // running ESLint twice doubled its 1.5GB RSS peak with no new signal.)
    "lint - eslint": "bun run lint:eslint",
    // oxlint remains manual; the canonical runner does not report it as correctness evidence.

    // Formatting
    "format - dprint": "bun run format",
    "md - lint": "bun run md:lint",
    // Mermaid block lint — every ```mermaid fence in docs/ and .plan/ must parse.
    // mmdlint is headless (jsdom-backed), no browser, bun-native, <30s on the whole tree.
    "mermaid - lint (mmdlint)": "bun run mermaid:lint",

    // Dead-code analysis (knip)
    "dead - code (knip)": "bun run dead:code",

    // Circular-import check remains manual; current debt is non-blocking.

    // Wiring + dead-code check gate (routes mounted, services wired, plugins registered)
    "wiring - check": "bun run scripts/check-wiring.ts",
    "fe-be - harmony": "bun run scripts/check-fe-be-harmonization.ts",

    // Changelog gate (Keep-a-Changelog structure; latest tag must have a section)
    "changelog - gate": "bun run scripts/check-changelog.ts",

    // DB schema staleness (regenerates into temp dir, diffs vs committed)
    "db - schema gate": "bun run scripts/check-db-schemas.ts",

    // Migration ordering: numeric-prefix uniqueness + localeCompare-free sort.
    // BUG-migration-ordering-ambiguous-via-localecompare-duplicate-num.
    "migrations - ordering": "bun run scripts/check-migration-ordering.ts",

    // Backlog index reconciliation (file-map rows ↔ tier files; orphans/phantoms)
    "backlog - index": "bun run plan:backlog:sync",

    // Reverse code→plan index freshness (code-map.json matches a fresh rebuild)
    "code-map - freshness": "bun run plan:map:check",

    // Ticket index reconciliation (index.json ↔ .md ↔ git issues)
    "plan - ticket index (sync)": "bun run plan:sync",

    // Comprehensive .plan/ validation (format, linkage, backlog, tickets,
    // code-map, links, spdx, naming, epics-doc, status-vocab, matrix)
    "plan - validate": "bun run plan:validate",

    // Feature matrix freshness (.plan/feature-matrix.md vs a fresh rebuild)
    "plan - matrix": "bun run plan:matrix:check",

    // Size check
    "size - check": "bun run scripts/check-file-size.ts",
    // size - strict: re-enabled — files over 250L need splitting (recent additions)
    "size - strict": "bun run scripts/check-file-size.ts --strict",
    // Context weight
    "context - weight": "bun run scripts/check-context-weight.ts",

    // Shell reference guard (no .sh references in docs)
    "no - shell - refs": "bun run scripts/check-no-shell-refs.ts",

    // Coverage gate: per-module line % vs 80% floor (see AGENTS.md Verification Gates).
    // Bun writes lcov into the per-RUN coverage dir so concurrent and
    // successive runs do not clobber each other. `coverage.mjs` is told
    // where to read from via `--coverage-dir=<COVERAGE_DIR_RELATIVE>`.
    // The actual command is built lazily in `coverageCommand()` below so
    // it can reference the per-RUN constants (declared after this block).
    "coverage - per-module line %": NOOP_OK, // placeholder; replaced before run
    // Blocking: resolve every physical view through production includes/icons.
    "frontend - template preflight": "bun run scripts/check-frontend-templates.ts",
    // Blocking: unescaped server-derived data in innerHTML is a stored-XSS vector.
    "frontend - innerHTML xss": "bun run scripts/check-frontend-innerhtml-xss.ts",
    // Browser baseline: one serial gate runs the complete Playwright surface.
    "e2e - browser (baseline)": "bun run test:e2e:browser",
    // Banned-pattern findings are collected in the non-blocking report below.
    // Epic coverage remains manual; current planning debt is non-blocking.
  },
  // ── Run checks in parallel ──────────────────────────────────────

  PROJECT_ROOT = path.resolve(import.meta.dir, "..",),
  // Machine-readable report: written after every run, git-ignored (.tmp/).
  REPORT_DIR_RELATIVE = ".tmp",
  // Canonical (latest-run) report path. Updated atomically on every run;
  // consumers that only care about "the most recent report" read this file.
  REPORT_RELATIVE = ".tmp/check-report.json",
  REPORT_PATH = path.resolve(PROJECT_ROOT, REPORT_DIR_RELATIVE, "check-report.json",),
  // `.latest` symlink always points at the per-run filename written for the
  // most recent run, so external tools that don't know RUN_ID can chase a
  // stable filename. Symlink target is updated atomically via temp + rename.
  REPORT_LATEST_RELATIVE = ".tmp/check-report.latest.json",
  REPORT_LATEST_PATH = path.resolve(PROJECT_ROOT, REPORT_LATEST_RELATIVE,),
  // Per-run retention: how many historical `.tmp/check-report-<RUN_ID>.json`
  // files to keep. Older reports are pruned on each new run. ~200KB per
  // report × 20 = ~4MB worst-case disk footprint per worktree, auto-GC'd.
  REPORT_RETENTION_COUNT = 20,
  // Per-check output cap for the report (guards against multi-MB failure dumps).
  MAX_OUTPUT_CHARS = 100_000,
  // Run identity: unique per invocation; embedded in the report, used as the
  // per-run filename, and used to make the on-disk write atomic. Declared
  // before the per-tool scratch dirs because they embed it in their paths.
  RUN_ID = `${process.pid}-${Date.now().toString(36,)}`,
  // Per-tool scratch dir under .tmp/, keyed by RUN_ID so concurrent or
  // successive runs do not clobber each other's coverage/jscpd output.
  // The paths are exposed as `CHECK_REPORT_COVERAGE_LCOV` /
  // `CHECK_REPORT_JSCPD` for downstream consumers and pruned alongside the
  // check-report retention count to keep disk usage bounded.
  RUN_TMP_DIR_RELATIVE = `.tmp/run-${RUN_ID}`,
  RUN_TMP_DIR = path.resolve(PROJECT_ROOT, RUN_TMP_DIR_RELATIVE,),
  // Sub-paths consumed by `scripts/check/coverage.mjs` and the jscpd ratchet
  // gate (`scripts/check/jscpd-ratchet.mjs`).
  COVERAGE_DIR_RELATIVE = `${RUN_TMP_DIR_RELATIVE}/coverage`,
  COVERAGE_DIR = path.resolve(PROJECT_ROOT, COVERAGE_DIR_RELATIVE,),
  COVERAGE_LCOV_RELATIVE = `${COVERAGE_DIR_RELATIVE}/lcov.info`,
  COVERAGE_LCOV = path.resolve(PROJECT_ROOT, COVERAGE_LCOV_RELATIVE,),
  JSCPD_DIR_RELATIVE = `${RUN_TMP_DIR_RELATIVE}/jscpd`,
  JSCPD_DIR = path.resolve(PROJECT_ROOT, JSCPD_DIR_RELATIVE,),
  JSCPD_REPORT_RELATIVE = `${JSCPD_DIR_RELATIVE}/jscpd-report.json`,
  JSCPD_REPORT = path.resolve(PROJECT_ROOT, JSCPD_REPORT_RELATIVE,),
  // Per-run file path. Same JSON content as REPORT_PATH at any given moment.
  PER_RUN_REPORT_PATH = path.resolve(
    PROJECT_ROOT,
    REPORT_DIR_RELATIVE,
    `check-report-${RUN_ID}.json`,
  ),
  // Invocation mode — the runner is mode-agnostic; the label only records
  // how the check was invoked so fix/ci runs can't masquerade as plain ones.
  MODE = (() => {
    if (process.argv.includes("--ci",)) { return "ci"; }
    if (process.argv.includes("--fix",)) { return "fix"; }
    return "plain";
  })(),
  // Parallelism for the heavy `bun test` gates: `--parallel=N` hands test
  // FILES to N worker processes (per-file fresh globals; `--isolate` stays
  // for the non-parallel path and is compatible). Without it, isolate runs
  // are strictly sequential on one core — a 7-module scoped diff burned
  // 20-60+ min and made `giwt finalize` unfinishable under any caller
  // timeout (observed SIGTERM kills at 5/10/60 min, exit 143). Cap is
  // deliberately modest: whole heavy gates peak multi-GB RSS and two
  // co-scheduled gates OOM'd this host before; per-file workers are far
  // smaller, but 4-way bounds peak memory on multi-worktree hosts.
  // Override with CHECK_TEST_JOBS=N.
  TEST_JOBS = process.env.CHECK_TEST_JOBS ?? "4",
  IS_REPORT_LS = process.argv.includes("--report-ls",);
// Default skip patterns for the heavy `bun test` gates. Each entry is a
// substring matched against the test file path; matches are removed from the
// path list passed to `bun test`. Bun's own `--path-ignore-patterns` glob
// flag did not reliably exclude files on 1.4.2 (verified: --exclude and
// --path-ignore-patterns both still ran `src/db/migrations.test.ts`), so
// the runner builds a filtered path list at command-build time instead.
//
// Why these defaults:
//   - `src/db/migrations.test.ts` / `src/db/migration-roundtrip.test.ts`
//     hold the SQLite write-lock for the entire migration chain (full up +
//     full down roundtrip), serialize behind `--parallel=4`, and the FTS5
//     trigger dependency on `001_init.down()` is broken pre-fix
//     (migration 013_generation.ts DROP TABLE fires
//     `actor_memories_fts_ad` against the already-dropped `memories_fts`).
//     Until the upstream migration is fixed (see
//     .plan/tickets/TASK-coverage-gate-true-multi-worker-fanout-investigation.md),
//     these tests take 3+ min AND fail, which made `giwt finalize` blow
//     past any caller timeout. Skipping by default restores sub-5min
//     finalize; the heavy suite stays one env override away.
//
// Override (full re-inclusion): `CHECK_INCLUDE_HEAVY_DB_TESTS=1` → empty
// skip list. Per-pattern override: `CHECK_TEST_KEEP_REGEX='migrations'`
// removes any pattern whose substring appears in that string (allows
// trimming the skip set without editing the source).
const DEFAULT_TEST_SKIP_PATTERNS = [
    "src/db/migrations.test.ts",
    "src/db/migration-roundtrip.test.ts",
  ],
  SKIP_PATTERNS = (() => {
    if (process.env.CHECK_INCLUDE_HEAVY_DB_TESTS === "1") { return []; }
    const keep = process.env.CHECK_TEST_KEEP_REGEX;
    const base = DEFAULT_TEST_SKIP_PATTERNS;
    if (!keep) { return base; }
    const re = new RegExp(keep,);
    return base.filter((p,) => !re.test(p,));
  })(),
  matchesSkip = (p,) => SKIP_PATTERNS.some((pat,) => p.includes(pat,)),
  filterPaths = (paths,) => paths.filter((p,) => !matchesSkip(p,));

/**
 * Build the coverage gate command. Lives here — after the multi-declarator
 * `const` above — because it reads both the diff-scope results (`SCOPED_*`,
 * declared above the checks table) and the per-RUN scratch paths
 * (`COVERAGE_DIR_RELATIVE`, initialized inside that statement). The checks
 * table carries a NOOP placeholder at parse time; this assignment is the
 * "replaced before run" step promised there.
 *
 * Both modes write lcov into the per-RUN coverage dir so concurrent and
 * successive runs never clobber each other, and so the stdout contract can
 * emit `CHECK_REPORT_COVERAGE_LCOV` pointing at this run's file. The scoped
 * invocation must pass the same lcov reporter flags as `test:coverage` —
 * bare `--coverage` emits no lcov.info and the floor check always failed.
 * Scoped test set is every test under each touched top-level `src/` module
 * (adjacent test files alone cover too little to floor anything). Since
 * BUG-37a3763 the scoped gate floors each diff-touched src file
 * individually (`--files=`) instead of whole modules: a scoped lcov only
 * contains files the scoped tests loaded, so module aggregates were
 * structurally unpassable. Files never loaded are SKIPped as unmeasured.
 *
 * Skip patterns (see SKIP_PATTERNS above) drop matching paths before the
 * command is built; the path-list approach is more reliable than bun's
 * `--path-ignore-patterns` glob (verified on bun 1.4.2 — see comments).
 */
function coverageCommand() {
  const skipNote = SKIP_PATTERNS.length > 0
    ? ` # skip: ${SKIP_PATTERNS.join(", ",)}`
    : "";
  if (!DIFF_BASE) {
    // Plain mode: same flags and test set as `bun run test:coverage`
    // (e2e safeguard included), but into the per-RUN dir. The plain
    // branch needs the full path list expanded (no directory arg)
    // so the skip patterns actually filter — bun recurses into `src/`
    // and would discover the heavy tests otherwise. `tests/e2e/` and
    // `src/**/*.test.ts` are both flattened here.
    const srcTests = walkTestFiles(PROJECT_ROOT, "src",);
    const allPaths = ["tests/e2e/", ...filterPaths(srcTests,),];
    if (allPaths.length === 1) { return NOOP_OK; } // only `tests/e2e/` left
    return `E2E_SAFEGUARD=1 bun test --parallel=${TEST_JOBS} ${
      allPaths.join(" ",)
    } --isolate --coverage --coverage-reporter=text --coverage-reporter=lcov --coverage-dir=${COVERAGE_DIR_RELATIVE} && bun run scripts/check/coverage.mjs --floor=80 --coverage-dir=${COVERAGE_DIR_RELATIVE}${skipNote}`;
  }
  if (SCOPED_COVERAGE_PATHS.length === 0) { return NOOP_OK; }
  if (SCOPED_DIFF_SRC_FILES.length === 0) { return NOOP_OK; }
  // BUG-37a3763: floor diff-touched files individually — a scoped lcov can
  // never satisfy whole-module floors (bun emits records only for files the
  // scoped tests loaded).
  const filteredPaths = filterPaths(SCOPED_COVERAGE_PATHS,);
  if (filteredPaths.length === 0) { return NOOP_OK; }
  const filesFlag = SCOPED_DIFF_SRC_FILES.length > 0
    ? ` --files=${SCOPED_DIFF_SRC_FILES.join(",",)}`
    : "";
  return `bun test --parallel=${TEST_JOBS} --isolate --coverage --coverage-reporter=text --coverage-reporter=lcov --coverage-dir=${COVERAGE_DIR_RELATIVE} ${
    filteredPaths.join(" ",)
  } && bun run scripts/check/coverage.mjs --floor=80 --coverage-dir=${COVERAGE_DIR_RELATIVE}${filesFlag}${skipNote}`;
}

/**
 * Recursively collect every `*.test.ts` file under `root/<dir>/`, returned
 * as repo-relative paths. Sorted for deterministic command lines.
 */
function walkTestFiles(root, dir,) {
  const out = [];
  const abs = path.resolve(root, dir,);
  if (!existsSync(abs,)) { return out; }
  const stack = [abs,];
  while (stack.length > 0) {
    const cur = stack.pop();
    for (const entry of readdirSync(cur, { withFileTypes: true, },)) {
      const full = path.join(cur, entry.name,);
      if (entry.isDirectory()) {
        stack.push(full,);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".test.ts",)) {
        out.push(path.relative(root, full,),);
      }
    }
  }
  return out.sort();
}

checks["coverage - per-module line %"] = coverageCommand();

/**
 * Blocking jscpd ratchet gate: run jscpd into the per-RUN scratch dir, then
 * compare the clone count against the committed baseline
 * (`scripts/check/jscpd-baseline.json`) via `scripts/check/jscpd-ratchet.mjs`.
 * Replaces the former advisory warn-only block in `runNonBlockingChecks`
 * (a permanent "N clones" warning never moved the number; the block was
 * silently dropped by a carry-over fold — BUG-jscpd-ratchet-gate-silently-removed-without-ticket).
 */
function jscpdGateCommand() {
  const jscpdScan =
    `bunx jscpd src/ --min-lines 4 --min-tokens 30 --ignore '**/*.test.ts,**/migrations/*,**/public/**,**/schema-manifest.ts,**/db-schemas.ts,**/insert-helpers.ts' --reporters json --output ${JSCPD_DIR_RELATIVE}`;
  return `${jscpdScan} && bun run jscpd:ratchet --report ${JSCPD_REPORT_RELATIVE}`;
}
checks["jscpd ratchet"] = jscpdGateCommand();

/**
 * Weave-damage scan gate: consecutive-duplicate growth vs a pre-rebase base
 * ref. Opt-in via WEAVE_BASE — agents set it after a weave-driven rebase,
 * whose resolver can duplicate lines or silently drop blocks (drops leave
 * every static gate green; observed 2026-10-01 in tui/chat/index.test.ts).
 * NOOP_OK keeps normal runs unaffected.
 */
checks["weave - damage scan"] = process.env.WEAVE_BASE
  ? "bun run scripts/check/weave-damage.mjs"
  : NOOP_OK;

// ── Apply selective gate filter ────────────────────────────────
// Runs after the `coverage - per-module line %` entry is registered so
// the filter sees every check name. Validation: any unknown name in
// either flag exits non-zero with a hint listing available names.
function applyGateFilter() {
  if (!GATES_FILTER && !SKIP_GATES_FILTER) { return; }
  const available = Object.keys(checks,).sort();
  const availableSet = new Set(available,);
  const requested = GATES_FILTER || SKIP_GATES_FILTER || [];
  const unknown = requested.filter((n,) => !availableSet.has(n,));
  if (unknown.length > 0) {
    console.error(
      `error: unknown gate name(s): ${unknown.map((n,) => JSON.stringify(n,)).join(", ",)}`,
    );
    console.error("available gates:",);
    for (const n of available) { console.error(`  ${n}`,); }
    process.exit(2,);
  }
  if (GATES_FILTER) {
    const selectedSet = new Set(GATES_FILTER,);
    for (const name of Object.keys(checks,)) {
      if (!selectedSet.has(name,)) { delete checks[name]; }
    }
    console.error(`gates filter: whitelisted ${GATES_FILTER.length} of ${available.length} gates`,);
  } else {
    const skipSet = new Set(SKIP_GATES_FILTER,);
    for (const name of Object.keys(checks,)) {
      if (skipSet.has(name,)) { delete checks[name]; }
    }
    console.error(
      `gates filter: skipped ${SKIP_GATES_FILTER.length}; running ${
        Object.keys(checks,).length
      } of ${available.length} gates`,
    );
  }
  if (Object.keys(checks,).length === 0) {
    console.error("error: --gates/--skip-gates left no checks to run",);
    process.exit(2,);
  }
}
applyGateFilter();

// ── GPG pre-flight ──────────────────────────────────────────────
// Tracks the cache state for provenance in the report. Shape:
// `cold` means we exited before any check ran — the report will reflect
// that via `exitCode: 1` from the cold-cache exit path below.
let GPG_PRECHECK_STATE = null;

/**
 * Pre-flight: ensure the agent's GPG key is unlocked before any check
 * subprocess starts. The probe is a silent trial sign (cancel-mode) — it
 * can never prompt or hang. A warm cache proceeds silently; a cold one is
 * warmed via the headless passphrase source (if configured) or the
 * terminal pinentry (TTY, non-ci), and anything that still cannot warm
 * refuses to start: a check subprocess signing against a cold cache would
 * hang on a pinentry prompt no harness can answer.
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
  // Step 1: honest probe — silent trial sign (cannot prompt, cannot hang).
  if (probeCachedPassphrase(keyId,).warm) {
    console.log(
      `gpg-precheck: warm (silent sign verified, ttl ${effectiveCacheTtl()}s, key ${keyId.slice(0, 8,)}...)`,
    );
    GPG_PRECHECK_STATE = { state: "warm", ttl: effectiveCacheTtl(), };
    return;
  }

  // Step 2: cold cache. Try the headless passphrase source first, then the
  // terminal pinentry (TTY, non-ci only). Anything else refuses to start —
  // a check subprocess that signs against a cold cache would hang.
  const passphrase = passphraseSource();
  if (passphrase) {
    console.error("gpg-precheck: cold; warming via loopback passphrase source...",);
    warmCacheViaPassphrase(keyId, passphrase,);
    if (probeCachedPassphrase(keyId,).warm) {
      GPG_PRECHECK_STATE = { state: "warm", via: "passphrase", };
      return;
    }
  } else if (MODE !== "ci" && process.stdin.isTTY) {
    console.error("gpg-precheck: cold; warming via pinentry (enter passphrase)...",);
    warmCacheViaPinentry(keyId,);
    if (probeCachedPassphrase(keyId,).warm) {
      GPG_PRECHECK_STATE = { state: "warm", via: "pinentry", };
      return;
    }
  }

  console.error("hint: gpg-cold-cache",);
  console.error(`GPG agent does not have ${keyId} unlocked.`,);
  console.error(`Run: bun run scripts/gpg-unlock.mjs`,);
  GPG_PRECHECK_STATE = { state: "cold", reason: "cache-cold", };
  process.exit(1,);
}

// ── Concurrency cap ────────────────────────────────────────────
// Resolve the per-run concurrency cap with priority: --jobs flag > CHECK_JOBS
// env > default 1 (serial). We refuse values < 1 (would deadlock) and cap at
// the check count to avoid the Promise.all-of-empty-array footgun. The cap
// exists so several worktrees (or several repos on the box) can run `bun run
// check` at once without the host hitting OOM — peak RSS scales ~linearly
// with concurrent checks.
//
// ponytail: 1 is the conservative default, not a measured optimum — agents
// finalize worktrees concurrently and co-scheduled heavy gates OOM-killed
// this host. An agent that wants a faster run passes --jobs N (or
// CHECK_JOBS=N) and owns the memory risk it takes on; the default never does.
const DEFAULT_JOBS = 1;
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
      `warn: Invalid --jobs/CHECK_JOBS value ${JSON.stringify(raw,)}; falling back to ${DEFAULT_JOBS}.`,
    );
    return DEFAULT_JOBS;
  }
  if (parsed > DEFAULT_JOBS) {
    console.error(
      `note: concurrency ${parsed} is above the default of ${DEFAULT_JOBS}; ` +
        `peak RSS scales with concurrent checks, and a second worktree running ` +
        `heavy gates at the same time OOMs this host.`,
    );
  }
  return parsed;
}
const JOBS = Math.min(parseJobs(), Object.keys(checks,).length,);

// Keep the TAIL of a failing gate's output. Failure details and summaries come
// last; gates that print thousands of advisory lines first (e.g. giwt's
// placeholder-hash list) otherwise push the actionable text past the cap.
function clipOutput(text, limit,) {
  if (text.length <= limit) { return text; }
  // Keep a head as well as the tail. A red gate's cause is not always at the
  // end: tsc/bun print the first error early and keep going, and a gate killed
  // by the OOM killer or a timeout has no verdict of its own to end on. The old
  // tail-only clip threw the head away, so the first diagnostic of a long gate
  // was unreachable without a re-run. Half the budget each side, since neither
  // half alone is the whole story.
  const head = Math.floor(limit / 2,),
    tail = limit - head,
    elided = text.length - limit;
  return `${text.slice(0, head,)}\n... (${elided} earlier chars elided; ${head} head + ${tail} tail chars kept) ...\n${
    text.slice(-tail,)
  }`;
}

// giwt reconciles .plan/ against the git issue CLI by shelling out to
// `git issue ls --all --format oneline` with a hard 10s budget (~3.2k issues;
// the call measures 5.4s idle and 15.5s on a loaded box, and is not always
// resolvable from the gate's environment at all). When it fails, giwt degrades
// to "git issue CLI unavailable", then lists every issue it could not see as an
// actionable finding (~112 phantom findings) and exits 1. A gate that could not
// be evaluated is not a gate that failed: report it as skipped with the reason
// printed, never as a red gate carrying invented findings to "fix".
//
// ponytail: ceiling — on a host where the issue CLI is *permanently*
// unreachable the plan gates never gate .plan/ drift. The skip is printed on
// every run and recorded in the report, so it is visible rather than silent.
// Fail closed once upstream giwt returns a distinct exit code for "cannot
// evaluate" (BUG-giwt-plan-gates-report-112-phantom-actionable-issues-when-th).
const GIWT_ISSUE_CLI_UNAVAILABLE = "git issue CLI unavailable";

// Per-gate budget overrides, keyed by gate name. Every gate NOT listed here
// gets the default (DEFAULT_GATE_TIMEOUT_MS, itself overridable by
// CHECK_GATE_TIMEOUT_MS). Only the genuinely slow gates are named: the browser
// baseline drives Playwright over the whole surface, and the coverage gate runs
// the suite under instrumentation. 15 min is already generous for the rest --
// the light-gate chunk finishes in seconds.
//
// ponytail: these are wall-clock budgets, not measured quantiles. A host that
// legitimately needs longer raises CHECK_GATE_TIMEOUT_MS once instead of
// widening this table gate by gate.
const GATE_TIMEOUT_MS = {
  "coverage - per-module line %": 30 * 60 * 1000,
  "e2e - browser (baseline)": 45 * 60 * 1000,
};

/**
 * Resolve a gate's wall-clock budget: explicit per-gate entry, else
 * CHECK_GATE_TIMEOUT_MS, else the 15 min default. An invalid env value warns
 * and falls back rather than failing the run over a typo.
 */
function resolveGateTimeoutMs(name,) {
  const perGate = Object.hasOwn(GATE_TIMEOUT_MS, name,) ? GATE_TIMEOUT_MS[name] : undefined;
  if (perGate !== undefined) { return perGate; }
  const raw = process.env.CHECK_GATE_TIMEOUT_MS;
  if (raw === undefined) { return DEFAULT_GATE_TIMEOUT_MS; }
  const parsed = Number.parseInt(raw, 10,);
  if (!Number.isFinite(parsed,) || parsed < 1) {
    console.error(
      `warn: Invalid CHECK_GATE_TIMEOUT_MS value ${JSON.stringify(raw,)}; ` +
        `using ${DEFAULT_GATE_TIMEOUT_MS}ms.`,
    );
    return DEFAULT_GATE_TIMEOUT_MS;
  }
  return parsed;
}

// oxlint-disable-next-line func-style
async function runCheck(name, command,) {
  const startedAt = performance.now(),
    timeoutMs = resolveGateTimeoutMs(name,);

  try {
    const gate = await runGateWithTimeout({
        name,
        command,
        timeoutMs,
        cwd: PROJECT_ROOT,
      },),
      // `bun test` prints its banner on stdout and every failure detail on
      // stderr, so `stdout || stderr` reported a failing gate as one banner
      // line and hid the cause. Keep both streams whenever stderr has content.
      gateOutput = gate.stderr.trim() ? `${gate.stdout}${gate.stderr}` : gate.stdout || gate.stderr,
      // A killed gate produced no verdict of its own, so the reason has to be
      // synthesized: name the gate and the budget that expired. It goes at the
      // END because clipOutput keeps the tail of a long gate, and a wedged gate
      // is exactly the kind that floods stdout -- prepended, this line is the
      // first thing the report throws away.
      output = gate.timedOut
        ? `${gateOutput}\nTIMEOUT: gate ${
          JSON.stringify(name,)
        } exceeded its ${timeoutMs}ms budget and was killed. Raise the budget with CHECK_GATE_TIMEOUT_MS=<ms>.`
        : gateOutput;
    // oxlint-disable-next-line sort-keys
    return {
      name,
      command,
      passed: gate.ok,
      // A timed-out gate is a failure, not an unevaluable gate: never let the
      // giwt-unavailable skip path mask a kill.
      skipped: !gate.timedOut && !gate.ok && gateOutput.includes(GIWT_ISSUE_CLI_UNAVAILABLE,),
      output,
      exitCode: gate.exitCode,
      durationMs: gate.durationMs,
      truncated: output.length > MAX_OUTPUT_CHARS,
      timedOut: gate.timedOut,
    };
  } catch (error) {
    // oxlint-disable-next-line sort-keys
    return {
      name,
      command,
      passed: false,
      skipped: false,
      output: error.message,
      exitCode: 1,
      durationMs: Math.round(performance.now() - startedAt,),
      truncated: false,
      timedOut: false,
    };
  }
}

// Heavy gates (bun test processes: unit/e2e/coverage) each peak at multiple
// GB RSS. Two of them co-scheduled in one JOBS chunk OOM-kills the runner
// (observed: `test - unit` dying after ~300 bytes of output when chunked
// alongside the coverage run). They are therefore pulled out of the chunked
// pool and run strictly one-at-a-time after the light gates.
//
// `plan - ticket index (sync)` also rides the serial tail: its giwt ticket
// scan takes the index lock while `plan - validate` runs the same scan
// internally. Chunked together, the loser's scan dies under lock contention
// and reports a false "index out of sync" / truncated ticket-set (observed
// deterministically across three consecutive runs).
//
// `lint - eslint` joins them on footprint, not on measured causation: measured
// at ~1.5 GB peak with `--concurrency=8` (package.json), it is the largest
// light-pool gate by a wide margin, so chunking it beside other multi-GB work
// is the shape that co-scheduled OOMs took. Moving it here removes that
// exposure; it is not evidence that eslint caused any specific kill.
const HEAVY_NAMES = new Set([
  "coverage - per-module line %",
  "e2e - browser (baseline)",
  "plan - ticket index (sync)",
  "lint - eslint",
],);

async function runAllChecks() {
  const allEntries = Object.entries(checks,);
  const entries = allEntries.filter(([name,],) => !HEAVY_NAMES.has(name,));
  const heavyEntries = allEntries.filter(([name,],) => HEAVY_NAMES.has(name,));
  const total = allEntries.length;
  console.log("=== loop-lore parallel check runner ===",);
  console.log(
    `Running ${total} checks with concurrency=${JOBS} (override via --jobs N or CHECK_JOBS=N)...\n`,
  );
  // Cap the number of in-flight light checks at JOBS. We schedule chunks of
  // size JOBS and await each chunk before starting the next; this keeps peak
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
  for (let offset = 0; offset < entries.length; offset += JOBS) {
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
        timedOut: false,
      },);
    }
  }
  // Heavy gates strictly serial: each is a multi-GB bun test process; even
  // two concurrently can OOM (see HEAVY_NAMES above).
  for (const [name, command,] of heavyEntries) {
    results.push(await runCheck(name, command,),);
  }
  return results;
}

function reportResults(results,) {
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const result of results) {
    if (result.skipped) {
      console.log(`SKIP: ${result.name}`,);
      console.log(
        `  ${GIWT_ISSUE_CLI_UNAVAILABLE} - the gate could not be evaluated. Re-run \`bun run ${
          result.command.replace(/^bun run /, "",)
        }\` on an idle host to check it.`,
      );
      skipped++;
    } else if (result.passed) {
      console.log(`PASS: ${result.name}`,);
      passed++;
    } else {
      // A timeout is a distinct failure mode from "the gate ran and said no":
      // the gate never got to render a verdict, so say so on the summary line.
      console.log(`FAIL: ${result.name}${result.timedOut ? " (timed out, killed)" : ""}`,);
      // Head for context, tail for the actual failure (see clipOutput).
      const outputLines = result.output.split("\n",),
        head = outputLines.slice(0, 5,),
        tail = outputLines.slice(-20,);
      console.log(
        `  Output: ${[...new Set([...head, ...(outputLines.length > 25 ? ["...",] : []), ...tail,],),].join("\n  ",)}`,
      );
      // The excerpt above drops the middle of the output, which for a long
      // gate run is exactly where the failing assertion lives. Persist the
      // untruncated output so a red gate stays diagnosable without a re-run.
      const slug = result.name.replace(/[^a-z0-9]+/gi, "-",).replace(/^-|-$/g, "",).toLowerCase();
      const logPath = path.join(RUN_TMP_DIR, `check-fail-${slug}.log`,);
      try {
        mkdirSync(RUN_TMP_DIR, { recursive: true, },);
        writeFileSync(logPath, result.output,);
        console.log(`  Full output: ${logPath}`,);
      } catch (error) {
        console.log(
          `  Full output unavailable (${String(error,)}). Re-run \`bun run ${
            result.command.replace(/^bun run /, "",)
          }\` directly.`,
        );
      }
      failed++;
    }
  }

  console.log("\n=== Summary ===",);
  console.log(`Total: ${results.length}`,);
  console.log(`Passed: ${passed}`,);
  console.log(`Skipped: ${skipped}`,);
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
  const skippedCount = checks.filter((check,) => check.skipped).length;
  const failedCount = checks.length - passedCount - skippedCount;
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
      skipped: skippedCount,
      failed: failedCount,
      durationMs,
    },
    checks: checks.map((check,) => ({
      command: check.command,
      passed: check.passed,
      skipped: check.skipped === true,
      // True when the gate blew its budget and was killed; the failure output
      // names the gate and the budget (see runCheck).
      timedOut: check.timedOut === true,
      exitCode: check.exitCode,
      durationMs: check.durationMs ?? 0,
      output: check.passed ? null : clipOutput(check.output ?? "", MAX_OUTPUT_CHARS,),
      truncated: check.passed ? false : (check.output ?? "").length > MAX_OUTPUT_CHARS,
    })),
    nonBlocking,
  };
}

function writeReport(report,) {
  mkdirSync(path.resolve(PROJECT_ROOT, REPORT_DIR_RELATIVE,), { recursive: true, },);

  // 1. Per-run file: full run-specific path. Survives concurrent runs because
  //    each RUN_ID is unique. Atomic write via temp + rename (no torn writes).
  const perRunTmp = `${PER_RUN_REPORT_PATH}.tmp`;
  const json = JSON.stringify(report, null, 2,) + "\n";
  writeFileSync(perRunTmp, json, "utf8",);
  renameSync(perRunTmp, PER_RUN_REPORT_PATH,);

  // 2. Canonical (latest) report: atomic rename from the per-run file. Last
  //    complete run wins. Concurrent readers see either the previous run's
  //    content or the new run's content — never torn. We then re-emit the
  //    per-run file so by-RUN_ID lookups still resolve.
  renameSync(PER_RUN_REPORT_PATH, REPORT_PATH,);
  writeFileSync(PER_RUN_REPORT_PATH, json, "utf8",);

  // 3. `.latest` symlink: a stable filename pointing at this run's per-run
  //    path. Atomic swap via temp + rename so consumers never see a dangling
  //    symlink mid-rotation.
  const latestTmp = `${REPORT_LATEST_PATH}.tmp`;
  try {
    unlinkSync(latestTmp,);
  } catch { /* expected if file doesn't exist */ }
  symlinkSync(`check-report-${RUN_ID}.json`, latestTmp,);
  renameSync(latestTmp, REPORT_LATEST_PATH,);
  // 4. Retention: prune oldest per-run files beyond REPORT_RETENTION_COUNT.
  //    The canonical `check-report.json` and `.latest.json` symlink are never
  //    touched — only `check-report-<RUN_ID>.json` files are GC'd. Same
  //    retention policy is applied to per-tool scratch dirs (`.tmp/run-*/`)
  //    so coverage/jscpd outputs from old runs don't accumulate.
  pruneOldReports();
  pruneOldRunTmpDirs();

  // 5. Stdout contract (Ticket 1):
  //    - Human-readable line with emoji for live terminals (existing behavior).
  //    - Machine-greppable lines, one per fact, no prefix noise. Downstream
  //    agents `grep ^CHECK_REPORT_` to extract facts without parsing the
  //    rest of the report. The `=` form is safe to feed to `cat` / `jq`.
  //    - Per-tool scratch paths are emitted only when the tool actually
  //    ran and produced output (CHECK_REPORT_COVERAGE_LCOV / _JSCPD).
  console.log(`\nCheck report: ${REPORT_PATH}`,);
  console.log(`CHECK_REPORT_PATH=${REPORT_PATH}`,);
  console.log(`CHECK_REPORT_LATEST=${REPORT_LATEST_PATH}`,);
  console.log(`CHECK_REPORT_RUN_ID=${RUN_ID}`,);
  if (existsSync(COVERAGE_LCOV,)) {
    console.log(`CHECK_REPORT_COVERAGE_LCOV=${COVERAGE_LCOV}`,);
  }
  if (existsSync(JSCPD_REPORT,)) {
    console.log(`CHECK_REPORT_JSCPD=${JSCPD_REPORT}`,);
  }
  return REPORT_PATH;
}
/**
 * Prune oldest per-run reports beyond `REPORT_RETENTION_COUNT`. The canonical
 * `check-report.json` and `.latest.json` symlink are never touched — only
 * `check-report-<RUN_ID>.json` files are GC'd. RUN_IDs embed `<pid>-<base36-time>`
 * so lexicographic sort is also chronological within a single worktree.
 */
function pruneOldReports() {
  const dir = path.resolve(PROJECT_ROOT, REPORT_DIR_RELATIVE,);
  let entries;
  try {
    entries = readdirSync(dir,);
  } catch {
    return; // dir missing → nothing to prune
  }
  // `.latest.json` is a symlink to one of the per-run files. Resolve it
  // so retention never deletes the file it currently points at (would
  // leave a dangling symlink for downstream consumers reading the stable
  // filename). `try` because the symlink may not exist yet (very first
  // run) or may already be broken (a previous bug left it dangling —
  // writeReport step 3 atomically replaces the symlink on the next run,
  // healing it without this function needing to).
  let latestTarget = null;
  if (existsSync(REPORT_LATEST_PATH,)) {
    try {
      latestTarget = readlinkSync(REPORT_LATEST_PATH,);
    } catch {
      // dangling symlink or unreadable — writeReport step 3 heals
      // on the next invocation; nothing to protect here.
    }
  }
  const perRun = entries
    .filter((name,) =>
      name.startsWith("check-report-",) &&
      name.endsWith(".json",) &&
      name !== "check-report.json" &&
      name !== "check-report.latest.json" &&
      name !== latestTarget
    )
    .sort((a, b,) => b.localeCompare(a,)); // newest first
  if (perRun.length <= REPORT_RETENTION_COUNT) { return; }
  const toDelete = perRun.slice(REPORT_RETENTION_COUNT,);
  for (const name of toDelete) {
    const target = path.join(dir, name,);
    try {
      // Defensive: never delete a symlink (the `.latest` filter above is
      // belt-and-suspenders). Avoids following a symlink and unlinking an
      // arbitrary target if a future naming change makes one slip through.
      const st = statSync(target,);
      if (st.isSymbolicLink()) { continue; }
      unlinkSync(target,);
    } catch { /* best-effort GC; race with concurrent prune is harmless */ }
  }
}

/**
 * Same retention policy as `pruneOldReports`, but applied to per-tool
 * scratch dirs created under `.tmp/run-<RUN_ID>/`. Coverage and jscpd
 * both write into those dirs, so capping their footprint keeps `.tmp/`
 * from growing unbounded across many check runs.
 *
 * Only the directories themselves are GC'd; symlinks (defensive: there
 * shouldn't be any today) are skipped, matching `pruneOldReports`.
 */
function pruneOldRunTmpDirs() {
  const dir = path.resolve(PROJECT_ROOT, REPORT_DIR_RELATIVE,);
  let entries;
  try {
    entries = readdirSync(dir,);
  } catch {
    return; // .tmp/ missing → nothing to prune
  }
  // run-<RUN_ID> directories, sorted by RUN_ID (which embeds pid + time,
  // so lexicographic sort is chronological within a single worktree).
  const perRun = entries
    .filter((name,) => name.startsWith("run-",) && name !== RUN_TMP_DIR_RELATIVE.slice(REPORT_DIR_RELATIVE.length + 1,))
    .sort((a, b,) => b.localeCompare(a,));
  if (perRun.length === 0) { return; }
  // Always keep the current run; prune oldest beyond the retention budget.
  const keepCurrent = 1;
  const toDelete = perRun.slice(Math.max(0, REPORT_RETENTION_COUNT - keepCurrent,),);
  for (const name of toDelete) {
    const target = path.join(dir, name,);
    try {
      const st = statSync(target,);
      if (st.isSymbolicLink()) { continue; }
      rmSync(target, { recursive: true, force: true, },);
    } catch { /* best-effort GC; harmless to skip on race */ }
  }
}

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
  console.log(
    `${"worktree".padEnd(32,)} ${"branch".padEnd(28,)} ${"head".padEnd(8,)} ${"report".padEnd(8,)} ${
      "kept".padEnd(5,)
    } status`,
  );
  for (const wt of worktrees) {
    const reportPath = path.join(wt.path, REPORT_DIR_RELATIVE, "check-report.json",);
    let report = null;
    let corrupt = false;
    try {
      report = JSON.parse(readFileSync(reportPath, "utf8",),);
    } catch {
      corrupt = existsSync(reportPath,);
    }

    // Count historical per-run reports retained on disk. Used to surface
    // worktrees that are filling `.tmp/` (e.g. CI churning through 100s of
    // runs without manual cleanup). Retention cap is REPORT_RETENTION_COUNT
    // but each worktree runs its own GC; the column exposes the current
    // population so operators can spot retention policy violations.
    const tmpDir = path.join(wt.path, REPORT_DIR_RELATIVE,);
    let kept = 0;
    try {
      kept = readdirSync(tmpDir,).filter((n,) =>
        n.startsWith("check-report-",) && n.endsWith(".json",) &&
        n !== "check-report.json" && n !== "check-report.latest.json"
      ).length;
    } catch { /* dir missing → 0 */ }

    const head = wt.head.slice(0, 7,);
    let status;
    if (corrupt) { status = "CORRUPT"; }
    else if (report === null) { status = "no-report"; }
    else if (report.gitHead && !wt.head.startsWith(report.gitHead,)) { status = "STALE"; }
    else if (report.passed === true) {
      // A skipped gate was not evaluated (see GIWT_ISSUE_CLI_UNAVAILABLE) -
      // surface it instead of letting the row read as a clean pass.
      const skipped = report.summary?.skipped ?? 0;
      status = skipped > 0 ? `pass (${skipped} skipped)` : "pass";
    } else { status = "FAIL"; }

    const reportHead = report?.gitHead ?? "-";
    const name = path.basename(wt.path,).padEnd(32,);
    const branch = (wt.branch || "(detached)").padEnd(28,);
    console.log(
      `${name} ${branch} ${head.padEnd(8,)} ${reportHead.padEnd(8,)} ${String(kept,).padEnd(5,)} ${status}`,
    );
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
        console.log(`OK: Version in sync: ${packageVersion}`,);
        notes.push({ level: "ok", message: `Version in sync: ${packageVersion}`, },);
      } else {
        console.log(`warn: Version drift: package.json=${packageVersion}, latest tag=${tagVersion}`,);
        console.log("  Run 'bun run version:sync' to reconcile",);
        notes.push({
          level: "warn",
          message:
            `Version drift: package.json=${packageVersion}, latest tag=${tagVersion}; run 'bun run version:sync'`,
        },);
      }
    }
  } catch {
    console.log("warn: Version check skipped",);
    notes.push({ level: "skipped", message: "Version check skipped", },);
  }

  // Banned-pattern findings are advisory debt, but remain visible in the report.
  try {
    const bannedProc = Bun.spawn(["bun", "run", "scripts/check-frontend-banned-patterns.ts",], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },);
    const bannedExit = await bannedProc.exited;
    const [bannedStdout, bannedStderr,] = await Promise.all([
      new Response(bannedProc.stdout,).text(),
      new Response(bannedProc.stderr,).text(),
    ],);
    const bannedText = (bannedStdout + bannedStderr).trim();
    const level = bannedExit === 0 ? "ok" : "warn";
    console.log(
      `${bannedExit === 0 ? "OK" : "warn"}: Frontend banned-pattern check (${bannedExit === 0 ? "clean" : "findings"})`,
    );
    if (bannedText) { console.log(bannedText,); }
    notes.push({
      level,
      message: `Frontend banned-pattern check: ${bannedExit === 0 ? "clean" : "findings"}${
        bannedText ? `\n${bannedText.slice(0, 4000,)}` : ""
      }`,
    },);
  } catch (error) {
    notes.push({ level: "skipped", message: `Frontend banned-pattern check skipped: ${error.message}`, },);
  }

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
      console.log(`warn: Markdown stale-link check found broken internal links:`,);
      for (const line of linksText.trim().split("\n",)) {
        if (line.includes("broken target",)) { console.log(`  ${line}`,); }
      }
    } else {
      console.log("OK: Markdown links OK",);
      notes.push({ level: "ok", message: "Markdown links OK", },);
    }
  } catch (error) {
    console.log(`warn: Markdown stale-link check skipped (${error.message})`,);
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
    console.log(`warn: License compliance check skipped (${error.message})`,);
    notes.push({ level: "skipped", message: `License compliance check skipped (${error.message})`, },);
  }
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  if (IS_REPORT_LS) {
    cmdReportLs();
    return;
  }

  // GPG pre-flight: verify the agent cache is warm via a silent trial
  // sign, warm it via the passphrase source or terminal pinentry if cold,
  // or refuse to start. This must run before any check subprocess so a
  // downstream `git commit` against a cold cache never hangs on a
  // pinentry prompt the harness can't answer.
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
  console.error("error: Check runner failed:", error.message,);
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
