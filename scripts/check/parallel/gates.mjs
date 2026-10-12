// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Gate command assembly. The static registry (`checks`, `ADVISORY_GATES`) lives
 * in `gate-table.mjs`; this module replaces its NOOP placeholders with the real
 * per-RUN commands, applies the --gates/--skip-gates filter via filter.mjs, and
 * leaves `checks` ready to run.
 */

// oxlint-disable-next-line import/no-nodejs-modules
import { existsSync, readdirSync, } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules
import path from "node:path";
import {
  COVERAGE_DIR_RELATIVE,
  JSCPD_DIR_RELATIVE,
  JSCPD_REPORT_RELATIVE,
  PROJECT_ROOT,
  TEST_JOBS,
} from "./config.mjs";
import {
  CHANGED_FILES,
  DIFF_BASE,
  NOOP_OK,
  SCOPED_COVERAGE_PATHS,
  SCOPED_DIFF_SRC_FILES,
} from "./context.mjs";
import { applyGateFilter, } from "./filter.mjs";
import { ADVISORY_GATES, checks, } from "./gate-table.mjs";
import { applyDiffScopedStaticGates, } from "./gates-scope.mjs";
import { filterPaths, SKIP_PATTERNS, } from "./test-skip.mjs";

// Re-exported so `runner.mjs` keeps one import site for the assembled table.
export { ADVISORY_GATES, checks, };

/**
 * Build the coverage gate command. Reads both the diff-scope results
 * (`SCOPED_*`, from context.mjs) and the per-RUN scratch paths
 * (`COVERAGE_DIR_RELATIVE`, from config.mjs), so it cannot live in the static
 * registry. `gate-table.mjs` carries a NOOP placeholder for this gate; the
 * assignment below is the "replaced before run" step promised there.
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
  // E2E_SAFEGUARD=1 here for the same reason as the plain branch above: the
  // scoped path list can include `tests/e2e/**` (any changed non-src file maps
  // to its own top-level name), and the e2e suite refuses to run against
  // anything but an in-memory DB / /tmp uploads without it. It was missing,
  // so a scoped run that reached the e2e helpers failed on the safeguard
  // rather than on the change under test.
  return `E2E_SAFEGUARD=1 bun test --parallel=${TEST_JOBS} --isolate --coverage --coverage-reporter=text --coverage-reporter=lcov --coverage-dir=${COVERAGE_DIR_RELATIVE} ${
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

// Browser specs live in one flat directory; this is the same filter the
// plain-mode runner script uses, kept here so the scoped builder and the full
// run can never disagree about what a "spec" is.
const BROWSER_SPEC_DIR = "tests/e2e/flows/browser/";

/**
 * Build the browser baseline command. Beside `coverageCommand()` because it
 * reads the same diff-scope inputs; `gate-table.mjs` carries a NOOP
 * placeholder and the assignment below is the "replaced before run" step.
 *
 * Plain mode delegates to the package script it replaces (`test:e2e:browser`
 * = `E2E_SAFEGUARD=1 bun run scripts/run-browser-tests.ts`), so it inherits the
 * per-spec env that script sets on each spawned child.
 *
 * The SCOPED form calls `bun test` directly and therefore inherits NOTHING —
 * it must carry that env prefix itself. `run-browser-tests.ts` gives each child
 * E2E_SAFEGUARD=1, HTTP_PROXY="" and NO_PROXY="*"; without the last two here,
 * a host with a proxy configured sends browser-spec fetches through it. `*` is
 * quoted because this string is executed through a shell — the script uses
 * Bun.spawn with an env object, where no quoting is needed.
 *
 * The scoped form runs only the specs the diff touched. Narrowing is allowed
 * ONLY when the mapping is unambiguous: every changed path is either a spec
 * that still exists, or a file under `tests/e2e/` whose change is confined to
 * the e2e harness itself.
 *
 * ponytail: ceiling — "confined to the harness" is a path-prefix rule, not
 * an import graph. It cannot tell whether an `src/` change breaks a spec, so
 * ANY changed non-spec, non-e2e file falls back to the FULL suite; so does a
 * deleted or renamed spec (git reports the destination alone, so the old
 * path is invisible and its spec is simply gone), and so does a spec that no
 * longer exists on disk. That bias is deliberate: a wrong narrowing is a
 * FALSE GREEN, and a slow browser gate is merely slow. The win is the common
 * case — a branch that only edits browser specs. Any richer mapping (a real
 * import graph, coverage-driven spec selection) would need the suite to run
 * once to build, which is the thing this builder exists to avoid.
 *
 * @returns The gate command, or NOOP_OK when the diff-scope matches nothing.
 */
function e2eBrowserCommand() {
  const full = "E2E_SAFEGUARD=1 bun run test:e2e:browser";
  if (!DIFF_BASE) { return full; }
  if (CHANGED_FILES.length === 0) { return NOOP_OK; }
  const specs = CHANGED_FILES.filter((f,) => f.startsWith(BROWSER_SPEC_DIR,) && f.endsWith(".browser.ts",));
  // Narrow ONLY on a SPEC-ONLY diff, i.e. `specs` covers EVERY changed path.
  // The equality IS the guard: an earlier version narrowed on `specs.length > 0`
  // alone, so a diff touching one spec AND an `src/` file ran only that spec --
  // a false green, since the src change could break any of the other specs. A
  // wrong narrowing is far worse than a slow gate, so ambiguity runs all of them.
  const specOnly = specs.length > 0 && specs.length === CHANGED_FILES.length;
  // A changed spec that is gone from disk (delete/rename) is not runnable, and
  // its disappearance can break the harness: fall back rather than guess.
  const specGone = specs.some((f,) => !existsSync(path.resolve(PROJECT_ROOT, f,),));
  if (specOnly && !specGone) {
    return `E2E_SAFEGUARD=1 HTTP_PROXY= NO_PROXY='*' bun test --max-concurrency=1 ${specs.join(" ",)}`;
  }
  // Ambiguous: no spec changed, a spec was deleted, or anything else rode along
  // with the specs. There is no narrower answer than "all of them" -- whether
  // the diff touched the harness or the app, the set of specs it can break is
  // every spec.
  return full;
}
checks["e2e - browser (baseline)"] = e2eBrowserCommand();

/**
 * jscpd ratchet gate: run jscpd into the per-RUN scratch dir, then compare
 * the clone count against the committed baseline
 * (`scripts/check/jscpd-baseline.json`) via `scripts/check/jscpd-ratchet.mjs`.
 * ADVISORY — it is listed in ADVISORY_GATES above, so a raised clone count is
 * reported without failing the run. The gate itself replaces the former
 * warn-only block in `runNonBlockingChecks` (a permanent "N clones" warning
 * never moved the number; the block was silently dropped by a carry-over fold
 * — BUG-jscpd-ratchet-gate-silently-removed-without-ticket).
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

// Narrow lint + md:lint to the diff when `--diff-base` is set. Before the
// --gates filter, so the filter narrows the SCOPED table rather than the
// static one.
applyDiffScopedStaticGates(checks,);
applyGateFilter(checks,);

// Resolved: deletion commit (dynamic assignments) + dev's giwt size gate paths
