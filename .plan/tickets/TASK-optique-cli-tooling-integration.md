<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Adopt @optique/core + @optique/run for typed CLI parsing

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** 🟡 In Progress
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-cli-tooling-optique
**Type:** Infrastructure

## Summary

Adopt [Optique](https://optique.dev/) (`@optique/core@^1.2.6`, `@optique/run@^1.2.6`) as the single
CLI argument parser for every script and tool entry point in `src/`. Replace ad-hoc
`Bun.argv.slice(2)` / `process.argv` parsing with combinatorial, strictly typed parsers. Gain
auto-generated `--help` / `--version`, shell completion, and typed parsed values from one shared
module.

## Motivation

Today four call sites hand-roll argv parsing:

| File | Pattern | Risks |
| ---- | ------- | ----- |
| `src/scripts/version-bump.ts` | positional `command` + `--bump=` + `--tag` | ad-hoc branching; no help; no completion |
| `src/scripts/commit-check.ts`  | `--all` / `--staged` / `--bump=`         | ad-hoc branching; no JSON output |
| `src/config/migrate-config.ts` | `--input` / `--output` / `--dry-run` / `--format` | default values duplicate; `--format` accepts junk |
| `src/build/compress.ts`        | 4 positional `process.argv[N]` slots  | no validation; no `--help` |

Each reimplements flag detection, value coercion, error messages, exit codes, and defaults. None
offers completion or has tests for argument parsing. Adding a flag means editing every site.

Optique provides: combinator-based grammar (`object`/`command`/`or`/`withDefault`), `InferValue<typeof parser>`
result types, automatic `--help` / `--version` via `@optique/run`, and shell completion (bash, zsh,
fish, PowerShell, Nushell) — all from a 5-line config.

## Plan

### 1. Install

```bash
bun add @optique/core @optique/run
```

Both MIT-licensed; `@optique/core` has zero runtime deps; engines: `bun >= 1.2.0`.

### 2. New `src/cli/` module

- **`src/cli/parser.ts`** — thin wrapper over `@optique/run`'s `run()` plus re-exports of the
  Optique symbols actually used by current call-sites: `object`, `option`, `flag`, `optional`,
  `withDefault`, plus value parsers `string`, `integer`, `choice`. Exports `runScript(parser,
  options)` which forwards `programName`, `brief`, `description`, `examples`, `help`, `version`,
  `completion`, `showDefault`, `errorExitCode`, and `args` to `run()`. Add symbols to the re-export
  list when a future migration needs them — do not speculatively export.
- **`src/cli/parser.test.ts`** — table-driven tests for `runScript`: success with custom args,
  default application, message-layer passthrough (brief/description/examples), integer bounds
  validation. All imports route through `./parser` so the test exercises the wrapper's export
  surface, not the underlying Optique primitives.

### 3. Migrate the four call sites

For each, write the Optique parser first, then delete the `parseArgs()` block. Preserve

| File | Parser shape | Notes |
| ---- | ------------ | ----- |
| `src/scripts/version-bump.ts`   | `object({ sync, type: optional(option(--bump, choice)), tag })` | default action is `predict`; `--sync` and `--bump=TYPE` flags preserved |
| `src/scripts/commit-check.ts`   | `object({ all: withDefault(flag(--all, --staged), false) })` | accepts both `--all` and `--staged` as aliases; hook mode auto-detected via `!process.stdin.isTTY` |
| `src/config/migrate-config.ts`  | `object({ input: option(--input, string), output, dry-run, format: choice([toml, yaml]) })` | `--format` now rejects junk at the parser layer |
| `src/build/compress.ts`         | `object({ directory: withDefault(option(--dist, string), ./dist/public), sourcePublic, sourceViews, sourceComponents })` | positional `argv[N]` slots become named flags |

### 4. Verification

```bash
bun run test:unit -- src/cli/ src/scripts/ src/config/ src/build/
bun run check                                              # all gates green
bun run scripts/version-bump.ts --help                     # renders help
bun run scripts/version-bump.ts                            # predict path still works
```

## Acceptance Criteria

- [x] `@optique/core` + `@optique/run` added at `^1.2.6`
- [x] `src/cli/parser.ts` exports `runScript` + minimal re-exports (object, option, flag, optional, withDefault; string, integer, choice)
- [x] `src/cli/parser.test.ts` covers parse success, defaults, message-layer passthrough, integer bounds (4 tests pass)
- [x] `version-bump.ts` migrated; existing `--sync` and `--bump=TYPE` flag contract preserved
- [x] `commit-check.ts` migrated; `--all` and `--staged` aliases preserved; hook mode preserved
- [x] `migrate-config.ts` migrated; `--format` now rejects junk at the parser layer
- [x] `compress.ts` migrated; positional `argv[N]` slots become named `--dist/--public/--views/--components` flags
- [x] `scripts/build-frontend.mjs` updated to invoke `compress.ts` with the new named flags
- [x] `bun run typecheck` passes; `src/cli/parser.test.ts` 4/4 passes; `bun run build:frontend` runs end-to-end (RET 0, 23 .gz/.zst/.br files produced); all 4 wired-up package.json scripts work; negative paths return RET 1 with Optique-formatted errors
- [x] `bun install --frozen-lockfile` succeeds against the updated `package.json`
- [ ] `src/cli/valueparsers.ts` and `docs/spec/cli-tooling.md` (deferred — tracked as future ticket)
  - Optique ships a comprehensive value-parser catalog (`string`, `integer`, `choice`, `path`, `url`,
    `port`, `cron`, …); no project-specific wrappers needed yet. Spec doc deferred until a third CLI
    is migrated.

## Files Touched

```
.plan/epics/epic-cli-tooling-optique.md       (new — research & plan)
.plan/tickets/TASK-optique-cli-tooling-integration.md  (this file)
src/cli/parser.ts                             (new)
src/cli/parser.test.ts                        (new)
src/scripts/version-bump.ts                   (migrate)
src/scripts/commit-check.ts                   (migrate)
src/config/migrate-config.ts                  (migrate)
src/build/compress.ts                         (migrate)
scripts/build-frontend.mjs                    (update caller)
package.json                                  (+ 2 deps)
bun.lock                                      (auto)
```