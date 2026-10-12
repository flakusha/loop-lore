// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The static gate registry: every named check the parallel runner can execute,
 * plus the advisory set. Declarations only — the gates whose commands depend
 * on per-RUN state are carried as NOOP placeholders here and replaced by the
 * builders in `gates.mjs`, which owns the assembly.
 */

import { NOOP_OK, } from "./context.mjs";

// oxlint-disable-next-line sort-keys
export const checks = {
  // Type checking
  "typecheck - backend": "bun run typecheck",
  "typecheck - frontend": "bun run typecheck:frontend",
  "typecheck - coverage": "bun run typecheck:coverage",
  "typecheck - coverage - frontend": "bun run typecheck:coverage:frontend", // 95% floor each (re-enabled after TS5.9 unblock; type-coverage-core uses ts.SyntaxKind.Unknown, TS7-incompatible)
  // BUG-typecheck-scripts-worktree-referenceerror-class-bugs-ship-gr:
  // the in-repo scripts/ CLI ships outside tsconfig.backend.json (src/** only).
  // Scoped tsconfig.scripts.json relaxes strict debt but keeps name
  // resolution so unimported identifiers (TS2304/TS2552 ReferenceError
  // class) fail the gate instead of crashing at runtime.
  //
  // Scope narrowed 2026-10-12 (scripts-migration-delete) to scripts/plan/ +
  // scripts/check/ — the islands that survived the worktree/ CLI deletion.
  // A blanket scripts/**/*.ts include does NOT work: it reports ~64
  // pre-existing noUncheckedIndexedAccess / test-cast errors, and relaxing
  // strict for the whole tree breaks discriminated-union narrowing in the
  // src/ modules those scripts import (1000+ errors). Widen per-island as
  // that debt clears.
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

  // Dead-code analysis (knip). BLOCKING, and it runs knip TWICE — see the
  // `project` comment in knip.json for why. Pass 1 is plain `knip`
  // (gitignore-respecting); src/.gitignore is a blanket `.`, so pass 1 alone
  // resolves zero src/ files. Pass 2 (`--no-gitignore`) is what makes src/
  // coverage real for dependency analysis, the one src-covered analysis that is
  // clean today.
  "dead - code (knip)": "bun run dead:code",

  // src dead-FILE scan. `knip.json` `project` covers `src/**/*.ts`, but
  // `src/.gitignore` is a blanket `.` (it keeps untracked scratch out of git)
  // and knip honors gitignore -- so without `--no-gitignore` every src file is
  // invisible. This gate lifts that layer, which is how src file coverage
  // actually works: `bun run dead:code` (BLOCKING) covers src/ DEPENDENCIES,
  // this gate covers src/ FILES.
  //
  // Scoped to `--include files` (unused MODULES, not unused exports): the
  // export-level analysis of src/ is a separate and much larger sweep tracked
  // by its own ticket, and gating on it here would block every branch until
  // that bulk cleanup lands. The unused-file list is the reviewable slice -- a
  // whole unreferenced file can be deleted outright.
  //
  // CURRENTLY FAILING -- see the ADVISORY_GATES entry below; do not report this
  // gate as passing.
  "dead - code (src files)": "bun run dead:code:src",

  // Circular-import check remains manual; current debt is non-blocking.

  // Wiring + dead-code check gate (routes mounted, services wired, plugins registered)
  "wiring - check": "bun run scripts/check-wiring.ts",
  "fe-be - harmony": "bun run scripts/check-fe-be-harmonization.ts",

  // API reference drift: docs/reference/api.md vs the generated spec.
  // BLOCKING, not advisory: the gate regenerates the spec itself (~1s) from
  // tracked sources only, so unlike the .plan/ freshness checks it cannot drift
  // from a concurrent dev merge — api.md and the route modules both move in the
  // same commit that would have to touch them.
  "api - doc drift": "bun run scripts/check/api-doc-drift.mjs",

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

  // Generated fuzz-test freshness: the committed
  // src/validation/schema-fuzz.generated.test.ts must match what
  // scripts/generate-schema-fuzz.ts emits from the schema modules on disk.
  "fuzz - generated tests": "bun run scripts/generate-schema-fuzz.ts --check",

  // Locale catalog reconciliation: every public/public/locales/*.json must
  // match en.json (missing keys get the English fallback, extras are stale).
  // BLOCKING, not advisory: the check is deterministic over tracked files and
  // cannot drift from a concurrent dev merge. `bun run i18n:fix` repairs.
  "i18n - reconcile": "bun run scripts/i18n-reconcile.ts --ci",

  // Test-gap ratchet: runtime exports no test file names, vs a committed
  // baseline. BLOCKING, not advisory: the matcher requires a real import
  // edge (not an incidental token), so the signal is trustworthy enough to
  // enforce. Adding the gate to ADVISORY_GATES is the escape hatch if it is
  // ever found to drift like jscpd does.
  "tests - coverage gaps": "bun run scripts/check/test-gaps.mjs",

  // Coverage gate: per-module line % vs 80% floor (see AGENTS.md Verification Gates).
  // Bun writes lcov into the per-RUN coverage dir so concurrent and
  // successive runs do not clobber each other. `coverage.mjs` is told
  // where to read from via `--coverage-dir=<COVERAGE_DIR_RELATIVE>`.
  // The actual command is built lazily by `coverageCommand()` in gates.mjs,
  // so it can reference the per-RUN constants.
  "coverage - per-module line %": NOOP_OK, // placeholder; replaced before run
  // Blocking: resolve every physical view through production includes/icons.
  "frontend - template preflight": "bun run scripts/check-frontend-templates.ts",
  // Blocking: unescaped server-derived data in innerHTML is a stored-XSS vector.
  "frontend - innerHTML xss": "bun run scripts/check-frontend-innerhtml-xss.ts",
  // Browser baseline: one serial gate runs the complete Playwright surface.
  // Built lazily by `e2eBrowserCommand()` in gates.mjs, like the coverage gate,
  // so it can narrow to the specs `--diff-base` touched.
  "e2e - browser (baseline)": NOOP_OK, // placeholder; replaced before run
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
  // src dead-file scan: the src tree currently carries confirmed-unreachable
  // modules, enumerated by path in the cleanup tickets.
  //
  // THIS GATE IS CURRENTLY FAILING. `bun run dead:code:src` exits non-zero
  // because it lists the dead src/ files. Because it sits in ADVISORY_GATES the
  // runner prints `Failed: 0` and `=== All checks passed ===` — that is runner
  // accounting, NOT a pass. Never cite this gate as green: run the command and
  // report its exit status. (The file count is deliberately not quoted here — it
  // moves as cleanup lands.) The gate still RUNS, so a reopened blindspot (knip
  // silently skipping src/ again) shows up in the report instead of vanishing.
  //
  // FLIP CONDITION: drop it out of ADVISORY_GATES (and delete this comment)
  // when `bun run dead:code:src` exits 0, i.e. once the enumerated dead src/
  // files have actually been deleted. Advisory until then — the debt is real,
  // large, and not reviewable in a single sweep.
  "dead - code (src files)",
],);
