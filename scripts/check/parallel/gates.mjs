// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 270

/**
 * The gate table and its command builders: every named check the runner can
 * execute plus the coverage/jscpd/weave command assembly. Module init builds
 * the table, applies the --gates/--skip-gates filter via filter.mjs, and
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
  DIFF_BASE,
  NOOP_OK,
  SCOPED_COVERAGE_PATHS,
  SCOPED_DIFF_SRC_FILES,
} from "./context.mjs";
import { applyGateFilter, } from "./filter.mjs";

// oxlint-disable-next-line sort-keys
export const checks = {
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

  // Conflict markers: no merge/rebase markers may land or linger in tracked
  // files — observed twice on dev in one window (82124d0b5 entities.ts,
  // ab4fc259a locales/UI), both survived typecheck + lint; only the unit
  // suite noticed.
  "conflict - markers": "bun run scripts/check/conflict-markers.mjs",

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
};

// Advisory gates: these RUN and REPORT like any other gate, but a failure
// does not fail the run. They are all generated-artifact freshness checks
// that drift from concurrent dev-side merges and are reconciled post-merge
// anyway — blocking a worktree finalize on them is pure friction.
//
// ponytail: the set is open-ended; add a gate here when it is proven to
// drift from concurrent merges faster than the branch can finalize. The
// failure is still visible in the report as ADVISORY, so the signal is
// not lost — it just does not block.
export const ADVISORY_GATES = new Set([
  // .plan/ validation: format, linkage, backlog, tickets, code-map, links,
  // spdx, naming, epics-doc, status-vocab, matrix — all drift when dev merges
  // plan changes concurrently.
  "plan - validate",
  // Ticket index reconciliation: index.json ↔ .md ↔ git issues — drifts when
  // dev merges ticket changes concurrently.
  "plan - ticket index (sync)",
  // Code-map freshness: code-map.json matches a fresh rebuild — drifts when
  // dev merges code changes concurrently.
  "code-map - freshness",
  // Feature matrix freshness: .plan/feature-matrix.md vs a fresh rebuild —
  // drifts when dev merges plan changes concurrently.
  "plan - matrix",
  // jscpd ratchet: clone count vs committed baseline — drifts when dev
  // merges add or remove clones concurrently.
  "jscpd ratchet",
],);

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

applyGateFilter(checks,);
