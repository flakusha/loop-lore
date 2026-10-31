// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 300
// One command-assembly pass: the coverage builder, the scope filters and the
// per-gate command bodies all read the same run context (DIFF_BASE, changed
// files, skip patterns), so splitting them would thread that context through
// every helper for no separation gain.

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
import { jscpdScanCommand, } from "../jscpd-scan.mjs";
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
  noopSkip,
  SCOPED_COVERAGE_PATHS,
  SCOPED_DIFF_SRC_FILES,
} from "./context.mjs";
import { applyGateFilter, } from "./filter.mjs";
import { ADVISORY_GATES, checks, } from "./gate-table.mjs";
import { applyDiffScopedStaticGates, browserSpecPaths, } from "./gates-scope.mjs";
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
    const srcTests = filterPaths(walkTestFiles(PROJECT_ROOT, "src",),);
    // plugins/** carries the bundled plugin engines' own *.test.ts. They sit
    // OUTSIDE src/, so the src/ walk above never found them and the coverage
    // run measured the plugin engines at ~4% — the tests existed but were
    // never executed. They are in-process unit tests (no subprocess), so they
    // belong inside the --coverage invocation, unlike scripts/** below.
    const pluginTests = filterPaths(walkTestFiles(PROJECT_ROOT, "plugins",),);
    // scripts/** carries colocated *.test.ts (coverage.mjs, the parallel
    // runner's config/context, src-refs, migration-parser, among others).
    // They previously ran only under bare `bun test`, never under any gate —
    // a change to scripts/check/parallel/ could land untested.
    //
    // They run OUTSIDE the --coverage invocation on purpose. These are CLI
    // smoke tests that drive their subject in a SUBPROCESS (spawnSync /
    // Bun.spawn), so the parent run's lcov only ever records module-load
    // side effects: generate-schema-fuzz.ts measured 18% with a full
    // colocated test suite. Flooring that partial number is a false red, and
    // coverage.mjs's own header names `scripts/` as the never-loaded-
    // in-process case that is meant to be reported unmeasured, not floored.
    // A failing scripts test still fails this gate — it is a second
    // `bun test` in the same && chain, not a demotion to advisory.
    //
    // The scoped branch below keeps excluding non-src trees for the same
    // reason: a scoped lcov holds only what the scoped tests loaded.
    const scriptTests = filterPaths(walkTestFiles(PROJECT_ROOT, "scripts",),);
    if (srcTests.length === 0 && pluginTests.length === 0 && scriptTests.length === 0) { return NOOP_OK; }
    const scriptsRun = scriptTests.length > 0
      ? `E2E_SAFEGUARD=1 bun test --parallel=${TEST_JOBS} ${scriptTests.join(" ",)} --isolate && `
      : "";
    return `E2E_SAFEGUARD=1 bun test --parallel=${TEST_JOBS} ${
      ["tests/e2e/", ...srcTests, ...pluginTests,].join(" ",)
    } --isolate --coverage --coverage-reporter=text --coverage-reporter=lcov --coverage-dir=${COVERAGE_DIR_RELATIVE} && ${scriptsRun}bun run scripts/check/coverage.mjs --floor=80 --coverage-dir=${COVERAGE_DIR_RELATIVE}${skipNote}`;
  }
  if (SCOPED_COVERAGE_PATHS.length === 0) { return NOOP_OK; }
  // BUG-2d6dcf3 companion: the scoped run below executes each diff test file
  // in its own process (--isolate), so it is structurally blind to collisions
  // that only appear when two files SHARE a process (observed 2026-10-01:
  // `bun test src/image-edit/` red while every scoped file passed in
  // isolation). Before the scoped run, each touched subsystem's WHOLE test
  // directory runs once unscoped — no --isolate — so presence-based
  // intra-directory collisions surface before finalize while the full suite
  // stays expensive. E2E_SAFEGUARD=1 for the same reason as the scoped run:
  // a src/ test may transitively load the e2e helpers.
  //
  // Targets derive from CHANGED_FILES (all src/ entries), NOT from
  // SCOPED_DIFF_SRC_FILES: that list excludes *.test.ts, so a TEST-ONLY diff
  // — the exact collision scenario — would otherwise produce zero companion
  // targets and the guard would silently not exist where it matters most.
  const companionTargets = subsystemTestTargets(CHANGED_FILES,);
  const companionRun = companionTargets.length > 0
    ? `E2E_SAFEGUARD=1 bun test --parallel=${TEST_JOBS} ${companionTargets.join(" ",)}`
    : "";
  // A test-only diff has no src implementation file to floor, so the scoped
  // lcov branch would NOOP — but the collision guard must still run.
  if (SCOPED_DIFF_SRC_FILES.length === 0) {
    return companionRun.length > 0 ? companionRun : NOOP_OK;
  }
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
  return [
    companionRun,
    `E2E_SAFEGUARD=1 bun test --parallel=${TEST_JOBS} --isolate --coverage --coverage-reporter=text --coverage-reporter=lcov --coverage-dir=${COVERAGE_DIR_RELATIVE} ${
      filteredPaths.join(" ",)
    } && bun run scripts/check/coverage.mjs --floor=80 --coverage-dir=${COVERAGE_DIR_RELATIVE}${filesFlag}${skipNote}`,
  ].filter((c,) => c.length > 0).join(" && ",);
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

/**
 * BUG-2d6dcf3: derive the unscoped companion targets from the diff's own
 * src/ files. Each `src/<mod>/...` path collapses to its subsystem directory
 * (`src/<mod>/`); a test file directly under `src/` has no subsystem and runs
 * by itself. Derived from SCOPED_DIFF_SRC_FILES rather than
 * SCOPED_COVERAGE_PATHS, which can also carry tests/e2e/** entries that must
 * not be re-run unscoped here.
 *
 * @param {string[]} files - repo-relative diff files under src/
 * @returns {string[]} sorted dir/file targets for a shared-process run
 */
function subsystemTestTargets(files,) {
  const targets = new Set();
  for (const f of files) {
    if (!f.startsWith("src/",)) { continue; }
    const segments = f.split("/",);
    targets.add(segments.length > 2 ? `${segments[0]}/${segments[1]}/` : f,);
  }
  // A target dir without a single *.test.ts makes `bun test` fail with
  // "filters did not match any test files" (reproduced with a diff touching
  // only src/views/settings.html: companion filter src/views/ found nothing
  // and exited 1). Drop such targets so a diff with no testable modules
  // reports skipped/no-op instead of failing the coverage gate.
  return [...targets,].sort().filter((t,) => walkTestFiles(PROJECT_ROOT, t,).length > 0);
}

checks["coverage - per-module line %"] = coverageCommand();

/**
 * Rust gates for the egui crate. ~130KB of Rust carries pedantic clippy in its
 * own Cargo.toml and no gate ran either check, so nothing was enforcing them.
 *
 * A host with no `cargo` cannot evaluate these at all, and AGENTS.md is
 * explicit that a gate which could not be evaluated reports SKIPPED, never
 * passed and never red — the absence of a Rust toolchain is a SUPPORTED state
 * (build:native and build:egui both degrade on it), so a red gate here would
 * punish exactly the environment the product decision protects. `noopSkip`
 * carries the reason into the report so the skip is visible, not silent.
 *
 * `cargo` on PATH is the honest probe: these are host-target gates (clippy /
 * fmt / test), not the wasm32 build, so they need no provisioned std.
 *
 * @param {string} command - the real gate command
 * @returns {string} `command`, or a skip marker naming the missing toolchain
 */
function rustGate(command,) {
  return Bun.which("cargo",) === null
    ? noopSkip("rust toolchain unavailable: cargo is not on PATH",)
    : command;
}

checks["lint - egui (clippy)"] = rustGate("bun run lint:egui",);
checks["format - egui (rustfmt)"] = rustGate("bun run format:egui:check",);
checks["test - egui"] = rustGate("bun run test:egui",);

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
 * The spec paths are `./`-prefixed (`browserSpecPaths`): `bun test` reads a
 * bare path as a name FILTER, and a `*.browser.ts` spec never matches that
 * filter — the scoped gate failed on every spec-only diff until the prefix.
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
    return `E2E_SAFEGUARD=1 HTTP_PROXY= NO_PROXY='*' bun test --max-concurrency=1 ${
      browserSpecPaths(specs,).join(" ",)
    }`;
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
  const jscpdScan = jscpdScanCommand({
    minLines: 4,
    minTokens: 30,
    reporters: "json",
    output: JSCPD_DIR_RELATIVE,
  },);
  return `${jscpdScan} && bun run jscpd:ratchet --report ${JSCPD_REPORT_RELATIVE}`;
}
checks["jscpd ratchet"] = jscpdGateCommand();

/**
 * Weave-damage scan gate: consecutive-duplicate growth vs a pre-rebase base
 * ref, whose resolver can duplicate lines or silently drop blocks (drops
 * leave every static gate green; observed 2026-10-01 in tui/chat/index.test.ts).
 *
 * The scan DERIVES its base (the merge-base of HEAD and the root branch)
 * when WEAVE_BASE is unset, so the gate runs on every branch instead of
 * degrading to a no-op; WEAVE_BASE still overrides it.
 */
checks["weave - damage scan"] = "bun run scripts/check/weave-damage.mjs";

// Local check-file-size is KEPT (see its header): giwt's copy exempts nothing
// but test files and exits 1 on generated DB-type modules (verified EXIT=1).
checks["size - check"] = "bun run scripts/check-file-size.ts";
checks["size - strict"] = "bun run scripts/check-file-size.ts --strict";

// Narrow lint + md:lint to the diff when `--diff-base` is set. Before the
// --gates filter, so the filter narrows the SCOPED table rather than the
// static one.
applyDiffScopedStaticGates(checks,);
applyGateFilter(checks,);
