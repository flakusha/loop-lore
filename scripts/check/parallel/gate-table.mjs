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
  // Bun 1.4.3's built-in TS7 checker. Not a substitute for the tsgo gates —
  // but it CAN select a project: `bun --check --tsconfig-override=<project>`
  // covers tsconfig.backend.json, tsconfig.frontend.json, tsconfig.scripts.json.
  // The bare `bun check` subcommand stays shadowed by this repo's `check`
  // script, hence the `--check` flag form. Its unique value is tests/**,
  // which no other gate type-checks (backend/frontend coverage gates run
  // their own projects). ~1.1s, so it rides along in check:fast.
  "typecheck - bun": "bun run typecheck:bun",
  "typecheck - frontend": "bun run typecheck:frontend",
  "typecheck - coverage": "bun run typecheck:coverage",
  "typecheck - coverage - frontend": "bun run typecheck:coverage:frontend", // 95% floor each (re-enabled after TS5.9 unblock; type-coverage-core uses ts.SyntaxKind.Unknown, TS7-incompatible)
  // scripts/** sat outside every coverage gate: tsconfig.backend.json is
  // src/** minus src/frontend/**, so the backend floor never saw it, and it
  // has no frontend sibling. Same 95% any-count floor via its own project.
  // Measured at 97.25% on landing, so the gate opens green rather than
  // opening as a waiver.
  "typecheck - coverage - scripts": "bun run typecheck:coverage:scripts",
  // BUG-typecheck-scripts-worktree-referenceerror-class-bugs-ship-gr:
  // the in-repo scripts/ CLI ships outside tsconfig.backend.json (src/** only).
  // Scoped tsconfig.scripts.json keeps name resolution so unimported
  // identifiers (TS2304/TS2552 ReferenceError class) fail the gate instead
  // of crashing at runtime.
  //
  // Widened 2026-10-14 (fix-nit-findings N2) to all of scripts/**/*.ts. The
  // only relaxations needed are noUncheckedIndexedAccess:false plus the
  // pre-existing noUnusedLocals/noUnusedParameters:false — strict stays on so
  // src/ modules imported by scripts keep their discriminated-union
  // narrowing. The residual debt it surfaced (bun query<T, Params> arity,
  // two test-cast sites) was cleared; do not re-relax strict.
  "typecheck - scripts": "bunx tsgo --noEmit -p tsconfig.scripts.json",
  // ESLint (single canonical entry — duplicate "lint - ts (eslint)" removed;
  // running ESLint twice doubled its 1.5GB RSS peak with no new signal.)
  "lint - eslint": "bun run lint:eslint",
  // oxlint remains manual; the canonical runner does not report it as correctness evidence.

  // Clippy for the native crate (native/loop-lore-native) — the Rust-side peer
  // of `lint - eslint`. The crate's own Cargo.toml [lints.clippy] already sets
  // all+pedantic to warn, so `--all-targets -- -D warnings` needs no config here.
  // Measured 11.6s COLD (isolated CARGO_TARGET_DIR: full blake3 + zstd-sys C
  // build) and 0.2s warm on the dev host — inside the default gate budget, so
  // this is a gate and not a CI-only step.
  //
  // Both native gates landed only after the crate was rustfmt-clean. The
  // crate shipped with 6 hunks of drift (gguf.rs comment/signature realignment,
  // lib.rs reorder_modules); wiring `format - native (rustfmt)` before clearing
  // that would have reddened `bun run check` on every branch. Debt first, gate
  // second — the sequence is the point, not the gate.
  "lint - native (clippy)": "bun run lint:native",

  // Clippy for the egui crate (native/loop-lore-egui) — the Rust-side peer of
  // `lint - native (clippy)` for the WASM frontend. The crate's own Cargo.toml
  // sets all+pedantic to warn, so `--all-targets -- -D warnings` needs no config
  // here. These three gates were defined in package.json with no gate and no CI
  // step running them; the NOOP placeholders below are replaced in gates.mjs by
  // real commands, or by a skip marker naming the missing Rust toolchain (a
  // host without cargo must report SKIPPED, never red — see AGENTS.md).
  "lint - egui (clippy)": NOOP_OK, // placeholder; toolchain-aware, replaced in gates.mjs
  "format - egui (rustfmt)": NOOP_OK, // placeholder; replaced in gates.mjs
  "test - egui": NOOP_OK, // placeholder; replaced in gates.mjs

  // Formatting
  "format - dprint": "bun run format",

  // rustfmt for the native crate, the Rust-side peer of `format - dprint`.
  // Measured 0.03s cold AND warm: `cargo fmt` parses only the crate's own 5
  // files (~24 KB) and never touches the dependency graph, which is why this is
  // ~400x cheaper than the clippy gate above. Style comes from the crate's own
  // native/loop-lore-native/rustfmt.toml (2-space, max_width 120), which cargo
  // resolves from the manifest dir — no config needed here.
  "format - native (rustfmt)": "bun run format:native:check",

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
  // BLOCKING as of the dead-code deletion sweep: `bun run dead:code:src` exits 0.
  // The last unreferenced src files were either deleted or, where the module is
  // unwired-but-owned (open WIRE tickets, an in-flight FEAT, epic-frontend-keynav-
  // mobile, epic-transport-expansion, the wire-deadcode worktree), recorded in
  // knip.json `ignore` with the owning ticket named. Reintroducing one without a
  // knip.json entry now reddens the gate, which is the point.
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

  // Static t() key gate: every t("...") call site in src/ must resolve to a
  // key in en.json. BLOCKING: t() returns the raw dotted key on miss, so a
  // missing catalog entry means users see key paths.
  "i18n - static keys": "bun run scripts/check/i18n-keys.mjs",

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

  // Roots guard (BUG-e994806): scripts/check/parallel/roots.test.ts is the
  // only guard on the PROJECT_ROOT/DIFF_ROOT hop and nothing ran it — a wrong
  // one-level hop exit(1)s the GPG pre-flight on every run, or silently
  // resolves zero diff files while all gates report success. It is a cheap
  // resource-contract test (asserts on module-level constants only), so it
  // needs no heavy-gate scheduling, and it is deliberately NOT folded into
  // the coverage gate: mixing a constant-assertion scripts/ file into a
  // per-module/per-file lcov floor couples two unrelated contracts.
  "check - roots": "bun test scripts/check/parallel/roots.test.ts",

  // Branch hygiene: classify local branches vs a base ref (delete vs review).
  // ADVISORY. The verdict depends on the branch topology of the moment — a
  // branch that reads REVIEW today becomes PATCH-EQ once dev lands its work,
  // and any branch with an active worktree may belong to a concurrent session.
  // Blocking a finalize on it would fight the dev branch's own movement.
  "branches - audit": "bun run scripts/audit-branches.ts",
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
  // Branch audit: verdicts drift as dev lands branch work — see the gate entry.
  "branches - audit",
],);
