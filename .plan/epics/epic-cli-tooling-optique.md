<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Type-safe CLI Tooling via Optique

**Tags:** cli, tooling, dx, typescript
**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** every migratable argv call site is on the shared parser; the remaining ones are structurally blocked and tracked in a follow-up ticket
**Priority:** Medium
**Effort:** Medium
**Type:** Infrastructure / DX

## Objective

Replace ad-hoc `Bun.argv.slice(2)` / `process.argv` parsing in scripts and CLI tools with a strictly-typed,
combinatorial parser based on [Optique](https://optique.dev/) (`@optique/core` + `@optique/run`).
Goal: typed parsed values, auto-generated `--help` / `--version`, shell completion, and one shared pattern
for subcommands across every CLI entry point in the repo.

## Why

Before this epic, every CLI entry point hand-rolled its own parsing. A repo-wide census found the
pattern across `src/` and `scripts/` alike — boolean flags sniffed with `argv.includes("--x")`, values
sliced out with `argv.find(a => a.startsWith("--x="))`, positionals read as `argv[2]`, and a few
fully hand-written `parseArgs()` loops. Representative sites:

- `src/scripts/version-bump.ts` (positional `command` + `--bump=<lvl>` + `--tag` flag)
- `src/scripts/commit-check.ts` (`--all`, `--staged`, `--bump=<lvl>`, hook-mode)
- `src/config/migrate-config.ts` (`--input`, `--output`, `--dry-run`, `--format`)
- `src/build/compress.ts` (positional directories)
- `scripts/check-file-size.ts`, `scripts/check-spdx.ts`, `scripts/check/test-gaps.mjs` (gate scripts
  whose stdout and exit codes the parallel check runner consumes)

Each one reimplements: flag detection, value coercion, error messages, exit codes, default values,
and `--help`. None offered completion or had tests for argument parsing, and the hand-rolled scans
silently ignored unknown flags — so a typo in a gate invocation failed silently instead of loudly.

## Why Optique

- **Type safety end-to-end**: parser describes the grammar; `InferValue<typeof parser>` is the result
  type. No separate `interface` to maintain.
- **Combinators first**: `object()`, `command()`, `or()`, `withDefault()`, `optional()` compose into a
  tree the type checker fully validates.
- **Zero-cost integration**: `@optique/run` reads `process.argv`, detects TTY width, applies colors,
  and exits on parse error / `--help` / `--version` automatically.
- **Shell completion built in**: bash/zsh/fish/pwsh/nu — one config flag, no hand-rolled scripts.
- **License-compatible**: MIT, no runtime dependencies in `@optique/core` itself.
- **Bun-native**: declared engines include `bun >= 1.2.0` (we're on 1.4+); types ship in the package.

## Scope

### In scope

1. **New module `src/cli/`** — shared parser primitives, value parsers, and `runScript()` helper:
   - `src/cli/parser.ts` — re-exports the most-used Optique entry points with a single
     `parseScriptArgs<T>(parser, options)` wrapper around `@optique/run` for testability.
   - `src/cli/valueparsers.ts` — project-specific value parsers (`levelString`, `tagName`,
     `safePath`, etc.) that reuse `src/utils` helpers.
   - `src/cli/log.ts` — bridge from Optique's `onExit`/`stderr` to our `createLogger`.
2. **Migrate every argv-parsing call site** in `src/` to Optique:
   - `src/scripts/version-bump.ts`
   - `src/scripts/commit-check.ts`
   - `src/config/migrate-config.ts`
   - `src/build/compress.ts`
3. **Replace `src/scripts/worktree/index.mjs` + commands** with the same pattern (29 commands already
   ported; this epic only unifies the `argv` parsing layer, not the command surface).
4. **Tests**: one table-driven unit test per migrated CLI that exercises `--help`, success path,
   missing required arg, invalid enum value.
5. **Documentation**: `docs/spec/cli-tooling.md` describing the parser module + the rule that any
   new `src/scripts/*.ts` MUST use it.

### Out of scope (for this epic)

- Migrating `scripts/worktree/commands/*.ts` (already typed via a custom command surface; this epic
  doesn't refactor the worktree CLI itself, only proves the pattern).
- Rewriting `src/tui/app.ts` (no argv surface).
- Adding shell completion to every CLI — `completion` is wired into `runScript` and opt-in per call
  site, rather than switched on everywhere at once.

### Structurally blocked (tracked in the follow-up ticket)

These still read argv by hand, and cannot move to `runScript` without restructuring their host:

| Call site | Blocker |
| --------- | ------- |
| `scripts/check/parallel/config.mjs` | Parses `--ci` / `--fix` / `--report-ls` at module-init and exports the computed values; `runScript` returns a value, so this needs `check-parallel.mjs` to become the entry point that owns flag reading. |
| `scripts/check/parallel/context.mjs` | `CHANGED_FILES` / `DIFF_BASE` / `GATES_FILTER` are resolved at import time and consumed by `gates.mjs` on import. Same restructure. |
| `scripts/check/parallel/runner.mjs` | `JOBS` is resolved at module load and read throughout the runner. Same restructure. |
| `scripts/worktree/index.ts` | A subcommand dispatcher (`const [cmdName, ...cmdArgs] = process.argv.slice(2)`); needs `command()` grammar or a `giwt`-style dispatcher, not a flat object parser. |
| `scripts/worktree/finalize-lock-fixture.ts` | Test fixture spawned as a child process with positional temp-dir/mode slots; migrating it means changing the test harness, for no product benefit. |

## Library & version

| Package       | Version | License | Why                                       |
| ------------- | ------- | ------- | ----------------------------------------- |
| `@optique/core` | `^1.3.2` | MIT     | Parser combinators + value parser catalog |
| `@optique/run`  | `^1.3.2` | MIT     | Process-integrated `run()` runner         |

Declared engines: `node >= 20`, `bun >= 1.2.0`, `deno >= 2.3.0`. We are on Bun 1.4+ — compatible.

`@optique/core` has zero runtime dependencies (verified via `npm view`). `@optique/run` depends only
on `@optique/core`.

## Implementation Plan

### Phase 1 — Foundation

1. `bun add @optique/core @optique/run`
2. Create `src/cli/parser.ts` exporting:
   - `runScript<T>(parser, opts)` — thin wrapper over `run()` for type reuse.
   - Re-exports of common Optique symbols (`object`, `command`, `option`, `flag`, `argument`,
     `withDefault`, `optional`, `multiple`, `or`, `message`, etc.) so callers import from one place.
3. Add a typed unit test (`src/cli/parser.test.ts`) covering parse success / failure / help.

### Phase 2 — Migrate each script

For each file: write Optique parser first, keep behaviour byte-identical (same flags, defaults,
exit codes), then delete the `parseArgs()` block.

| File                            | Parser pattern                                | New features gained |
| ------------------------------- | --------------------------------------------- | ------------------- |
| `src/scripts/version-bump.ts`   | `command("bump", { type, tag })` + default    | help, completion    |
| `src/scripts/commit-check.ts`   | `object({ all, staged, json })`               | help, JSON output   |
| `src/config/migrate-config.ts`  | `object({ input, output, dryRun, format })`   | help, completion    |
| `src/build/compress.ts`         | `object({ directory, sourcePublic, ... })`    | help, type-checks   |

### Phase 3 — Verification

- `bun run typecheck` — type coverage ≥ 95% holds (the parsers add typed values, not `any`).
- `bun run test:unit -- src/cli/` — new parser tests pass.
- `bun run test:unit -- src/scripts/ src/config/ src/build/` — existing suites still pass.
- `bun run check` — all gates green.
- Manual smoke: `bun run scripts/version-bump.ts --help` renders help; `bun run scripts/version-bump.ts --bump=patch`
  still produces a patch bump (or in dev: just `bun run scripts/version-bump.ts` predicts).

## Risks & Mitigations

| Risk                                                              | Mitigation                                                              |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Bun-only API (`Bun.argv`) used today                              | Migrate to `process.argv` + `@optique/run` reads it automatically        |
| `--all` vs `--staged` switch — need value-OR-flag grammar         | Use `optional()` + `merge()` to combine                                  |
| Help output must match existing githook / CI expectations         | Snapshot `--help` output as test; user can override via `stdout`/`onExit` |
| License compliance — adding to dependency tree                    | Both packages MIT; confirmed via `npm view <pkg> license`                 |
| Binary size — Optique unpacked size is ~3 MB; ESM tree-shake helps | Verify `bun build` output size delta; only `core` is actually imported by the server bundle |

## Status

- [x] Research Optique + integrate plan
- [x] Epic + ticket filed
- [x] Phase 1 — Foundation (`src/cli/parser.ts` + unit tests)
- [x] Phase 2 — Migrate every migratable argv call site in `src/` and `scripts/`
- [x] Phase 3 — Tests + `bun run check` green
- [x] Documentation — `docs/spec/cli-tooling.md` with the MUST-use rule
- [ ] Follow-up ticket — structurally blocked call sites (see Out of scope)

## Files

- `src/cli/parser.ts` — shared module: `runScript()` + the narrow re-export surface
- `src/cli/parser.test.ts` — unit tests for the wrapper
- `docs/spec/cli-tooling.md` — the house spec and the MUST-use rule
- `src/scripts/version-bump.ts`, `src/scripts/commit-check.ts`, `src/config/migrate-config.ts`,
  `src/build/compress.ts`, `src/scripts/backfill-users-encryption-secret.ts` — first migration wave
- `src/aux-pipeline/eval/cli.ts`
- `scripts/check-changelog.ts`, `scripts/check-licenses.ts`, `scripts/check-context-weight.ts`,
  `scripts/check-file-size.ts`, `scripts/check-frontend-banned-patterns.ts`,
  `scripts/audit-runtime-compat.ts`, `scripts/gen-deno-config.ts`, `scripts/gen-pkg-from-deno.ts`,
  `scripts/i18n-reconcile.ts`, `scripts/run-benchmarks.ts`, `scripts/build-verify.ts`
- `scripts/generate-schema-fuzz.ts`
- `scripts/check-spdx.ts`
- `scripts/plan/normalize-statuses.ts`, `scripts/plan/normalize-plan-metadata.ts`,
  `scripts/plan/epic-owner-pick.ts`
- `scripts/check/coverage.mjs`, `scripts/check/weave-damage.mjs`, `scripts/check/api-doc-drift.mjs`,
  `scripts/check/jscpd-ratchet.mjs`, `scripts/check/test-gaps.mjs`
- colocated `*.test.ts` / `*.test.mjs` beside each migrated script

### Deliberately not built

- `src/cli/valueparsers.ts` — dropped. Optique already ships a full value-parser catalog
  (`string`, `integer`, `choice`, `path`, `url`, `port`, `cron`, …) and no migrated call site
  needed a project-specific wrapper. Add one when a real caller needs it.
- `src/cli/log.ts` — dropped. `runScript` writes its own diagnostics to stdout/stderr;
  no call site needed an `onExit` bridge to `createLogger`.

## Related Epics

- [`epic-tooling-improvement.md`](epic-tooling-improvement.md) — parent permanent-tooling epic;
  this is the typed-CLI layer under its developer-experience scope.
- [`epic-script-migration.md`](epic-script-migration.md) — records the `.mjs` vs `.ts` decision that
  determines which migrated scripts are `.mjs` and which are `.ts`.
- [`epic-code-quality.md`](epic-code-quality.md) — owns the lint/format/size gates the migrated
  scripts must stay inside.
- [`epic-cicd-pipeline.md`](epic-cicd-pipeline.md) — several migrated scripts are themselves CI
  gates, so a parser change lands in the pipeline's blast radius.