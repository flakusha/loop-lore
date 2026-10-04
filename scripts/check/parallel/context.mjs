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
import { readdirSync, statSync, } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules
import path from "node:path";

// ── Diff-scoped mode ────────────────────────────────────────────
export const DIFF_ROOT = path.resolve(import.meta.dir, "../../..",);
// `--diff-base <ref>` scopes the expensive gates to the branch diff
// (lint-staged style): the coverage gate runs only tests under modules
// touched by the diff, and the browser baseline narrows to the specs the diff
// edited. Static/whole-project gates (typecheck, db schema, dead:code, …) are
// unchanged — they are cheap or inherently project-wide.
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
// of the `checks` dictionary below. Both the space form (`--gates a,b`) and
// the equals form (`--gates=a,b`) are accepted: the equals form is the one
// every other flag in this runner and its docs already use, and reading only
// the space form made `--gates=bogus` a silent no-op that ran the WHOLE suite.
// Names match verbatim after trimming whitespace; unknown names exit
// non-zero with a hint listing available names. The flag is the source of
// truth (trust semantics): no implicit inclusion of diff-scoped gates.
// Combined with `--diff-base`, the coverage/e2e entries still scope to the
// diff; `--gates` only narrows the executed subset.
function parseGateFlag(flag,) {
  const arg = process.argv.find((a,) => a === flag || a.startsWith(`${flag}=`,));
  if (arg === undefined) { return null; }
  // Equals form carries its own value; space form takes the next argv token.
  const eq = arg.indexOf("=",);
  const raw = eq === -1 ? process.argv[process.argv.indexOf(arg,) + 1] : arg.slice(eq + 1,);
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
 * Files `git diff --name-only base HEAD` reports, plus uncommitted
 * working-tree changes. Empty when `base` is null.
 *
 * Two-dot (`base`..`HEAD`), not merge-base. The question this answers is
 * "which files will this branch change when it lands on `base`", and only a
 * tree-vs-tree diff answers that. A merge-base diff answers a different
 * question — "which files did EITHER side touch since the fork" — so on a
 * branch that forked a while back it also returns every file `base` moved
 * independently. The coverage gate then floored whole files at the floor for
 * churn this branch never authored, blocking it on debt it did not create.
 *
 * `git diff A B` needs no common ancestor, so dropping the merge-base lookup
 * also removes a crash: `git merge-base` exits non-zero on unrelated
 * histories, which took the whole runner down.
 *
 * Two limits worth knowing before reading scope off this list. It is a
 * SUPERSET of what the merge actually changes, never a subset — a file the two
 * tips hold identically is excluded, but one only `base` moved is still listed
 * (over-scopes, which costs a false red, never a false green). And it only sees
 * TRACKED working-tree changes: `git diff HEAD` omits untracked files, so a new
 * source file that was never `git add`ed is not gated.
 *
 * @param base - Git ref to diff against, or null.
 * @param cwd - Repo root to diff in; defaults to this repo. Exists so tests
 *   can point the diff at a fixture repo.
 * @returns Sorted list of changed paths (repo-relative).
 * @throws {Error} when `base` does not resolve to a commit. The raw
 *   `execFileSync` throw carried a git stack trace and no hint, and this runs
 *   at module init — before `main()` — so the runner's error handler never saw
 *   it: a typo'd ref killed the whole sweep with a Bun stack trace and NO check
 *   report. The wrapped call rethrows an Error naming the offending ref and
 *   what a valid ref looks like, which the entry prints as a one-line message.
 *   `resolveDiffBase` in `scripts/worktree/commands/finalize.ts` still
 *   validates the ref first, so the finalize path fails early with its own
 *   message.
 */
export function changedFiles(base, cwd = DIFF_ROOT,) {
  if (!base) { return []; }
  // One call, one failure mode: both diffs below die together when `base` is
  // a typo, so catching around the pair keeps the message single-source.
  // `stdio` pins git's stderr to pipe — inherited, it would print git's
  // three-line 'ambiguous argument' complaint to the terminal ahead of our own
  // message, and the whole point of the wrap is a single actionable line.
  const gitOptions = { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe",], };
  let committed;
  let dirty;
  try {
    committed = execFileSync("git", ["diff", "--name-only", base, "HEAD",], gitOptions,);
    dirty = execFileSync("git", ["diff", "--name-only", "HEAD",], gitOptions,);
  } catch (cause) {
    // Single line by construction: git's own stderr is multi-line, and the
    // runner prints `message` verbatim, so embedding it would re-create the
    // wall-of-noise failure. The untruncated original stays on `.cause`.
    const gitLine = String(cause?.stderr ?? cause?.message ?? cause,).trim().split("\n",)[0] ?? "";
    throw new Error(
      `--diff-base ${JSON.stringify(base,)} is not a ref git can diff in ${cwd}. ` +
        `Pass a branch (dev, origin/dev), a tag, or a commit sha. ` +
        `git said: ${gitLine}`,
      { cause, },
    );
  }
  return [...new Set(`${committed}\n${dirty}`.split("\n",).map((f,) => f.trim()).filter(Boolean,),),].sort();
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
 * top-level `src/` module. Module breadth, not adjacency, is the point — a
 * lcov produced by only the co-located test files of the diff cannot floor
 * anything, so coverage is the only consumer of this scoping.
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

// Exported for the browser-scope builder in gates.mjs, which maps the diff
// onto browser specs by a rule of its own (the SCOPED_* exports below are
// coverage-shaped and cannot express it).
//
// The IIFE is not ceremony: this call runs at module init, ahead of main(),
// so the entry's `.catch` never sees a throw from here — a bad `--diff-base`
// would escape as a raw Bun stack trace. Catch it at the one call site that can
// fail on a bad flag, print `message` (already a complete one-liner, see
// changedFiles) and exit non-zero, the same shape as the mutually-exclusive-
// flags exit above. `changedFiles` keeps throwing, so its own contract — and
// the test pinning it — is unchanged.
export const CHANGED_FILES = (() => {
  try {
    return changedFiles(DIFF_BASE,);
  } catch (error) {
    console.error(`error: ${String(error?.message ?? error,).split("\n",)[0]}`,);
    process.exit(2,);
  }
})();
export const SCOPED_COVERAGE_PATHS = scopedCoveragePaths(CHANGED_FILES,);
// BUG-37a3763: floor diff-touched FILES, not whole modules — a scoped lcov
// only contains files the scoped tests loaded, so module aggregates are
// structurally unpassable. Test files and non-src trees are excluded (no
// meaningful per-file line coverage; non-src paths are unmeasured SKIPs).
export const SCOPED_DIFF_SRC_FILES = (DIFF_BASE ? CHANGED_FILES : [])
  .filter((f,) => f.startsWith("src/",) && f.endsWith(".ts",) && !f.endsWith(".test.ts",));
export const NOOP_OK = "true # diff-scope: no matching files";
