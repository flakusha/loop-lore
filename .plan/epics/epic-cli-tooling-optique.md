<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Type-safe CLI Tooling via Optique

**Tags:** (none)
**Overview:** (see sections below)


**Status:** 🟡 In Progress (foundation laid)
**Priority:** Medium
**Effort:** Medium
**Type:** Infrastructure / DX

## Objective

Replace ad-hoc `Bun.argv.slice(2)` / `process.argv` parsing in scripts and CLI tools with a strictly-typed,
combinatorial parser based on [Optique](https://optique.dev/) (`@optique/core` + `@optique/run`).
Goal: typed parsed values, auto-generated `--help` / `--version`, shell completion, and one shared pattern
for subcommands across every CLI entry point in the repo.

## Why

Current state — at least four call sites parse argv by hand:

- `src/scripts/version-bump.ts` (positional `command` + `--bump=<lvl>` + `--tag` flag)
- `src/scripts/commit-check.ts` (`--all`, `--staged`, `--bump=<lvl>`, hook-mode)
- `src/config/migrate-config.ts` (`--input`, `--output`, `--dry-run`, `--format`)
- `src/build/compress.ts` (positional directories)

Each one reimplements: flag detection, value coercion, error messages, exit codes, default values,
and `--help`. None offers completion or has unit tests for argument parsing. Adding a new flag is a
manual edit through every site.

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

- Migrating `scripts/worktree/commands/*.ts` (already typed via custom command surface; this epic
  doesn't refactor the worktree CLI itself, only proves the pattern).
- Rewriting `src/tui/app.ts` (no argv surface).
- Adding shell completion to every CLI — start with `version-bump` and `commit-check` (the most
  user-facing), then opt in elsewhere.

## Library & version

| Package       | Version | License | Why                                       |
| ------------- | ------- | ------- | ----------------------------------------- |
| `@optique/core` | `^1.2.6` | MIT     | Parser combinators + value parser catalog |
| `@optique/run`  | `^1.2.6` | MIT     | Process-integrated `run()` runner         |

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
- [ ] Phase 1 — Foundation (parser module)
- [ ] Phase 2 — Migrate version-bump / commit-check / migrate-config / compress
- [ ] Phase 3 — Tests + `bun run check` green

## Files

- `src/cli/parser.ts` — new shared module
- `src/cli/parser.test.ts` — new unit tests
- `src/cli/valueparsers.ts` — new domain value parsers
- `src/scripts/version-bump.ts` — migrate
- `src/scripts/commit-check.ts` — migrate
- `src/config/migrate-config.ts` — migrate
- `src/build/compress.ts` — migrate
- `docs/spec/cli-tooling.md` — new spec

## Related Epics

- `epic-tooling-improvement.md` — parent permanent-tooling epic
- `epic-script-migration.md` — `.sh` → `.mjs` / `.ts` migration; this epic is the type-safe parser
  layer they all eventually depend on.