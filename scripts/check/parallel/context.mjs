// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Diff-scope context for the parallel check runner: `--diff-base` resolution,
 * `--gates`/`--skip-gates` flag parsing, and the changed-file scoping that
 * feeds the test/coverage gates. Module init runs the flag/git queries, so it
 * must stay ahead of gates.mjs in the entry's import graph.
 */

// oxlint-disable-next-line import/no-nodejs-modules
import { execFileSync, } from "node:child_process";
// oxlint-disable-next-line import/no-nodejs-modules
import { existsSync, readdirSync, statSync, } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules
import path from "node:path";

// ── Diff-scoped mode ────────────────────────────────────────────
export const DIFF_ROOT = path.resolve(import.meta.dir, "../../..",);
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

export const DIFF_BASE = parseDiffBase();

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
export const GATES_FILTER = parseGateFlag("--gates",);
export const SKIP_GATES_FILTER = parseGateFlag("--skip-gates",);
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

export const CHANGED = changedFiles(DIFF_BASE,);
export const SCOPED_TESTS = scopedTestFiles(CHANGED,);
export const SCOPED_COVERAGE_PATHS = scopedCoveragePaths(CHANGED,);
// BUG-37a3763: floor diff-touched FILES, not whole modules — a scoped lcov
// only contains files the scoped tests loaded, so module aggregates are
// structurally unpassable. Test files and non-src trees are excluded (no
// meaningful per-file line coverage; non-src paths are unmeasured SKIPs).
export const SCOPED_DIFF_SRC_FILES = (DIFF_BASE ? CHANGED : [])
  .filter((f,) => f.startsWith("src/",) && f.endsWith(".ts",) && !f.endsWith(".test.ts",));
export const NOOP_OK = "true # diff-scope: no matching files";
