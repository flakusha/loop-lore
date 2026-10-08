<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Adopt @optique/core + @optique/run for typed CLI parsing

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** In Progress
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

- [x] `@optique/core` + `@optique/run` added
- [x] `src/cli/parser.ts` exports `runScript` + a narrow re-export surface (combinators
      `argument`/`flag`/`multiple`/`object`/`option`/`optional`/`withDefault`; value parsers
      `choice`/`integer`/`string`) — extended only as real call sites required
- [x] `src/cli/parser.test.ts` covers parse success, defaults, message-layer passthrough, integer bounds
- [x] First wave migrated: `version-bump.ts`, `commit-check.ts`, `migrate-config.ts`, `compress.ts`,
      `backfill-users-encryption-secret.ts` — flag contracts preserved
- [x] Second wave migrated — 21 further call sites across `src/aux-pipeline/eval/`, `scripts/*.ts`,
      `scripts/plan/*.ts` and `scripts/check/*.mjs`, each with a colocated parse test
- [x] `scripts/build-frontend.mjs` updated to invoke `compress.ts` with the new named flags
- [x] Every flag actually passed by `package.json`, `scripts/check/parallel/gates.mjs` and
      `.github/workflows/` is declared by the corresponding parser
- [x] Before/after exit codes compared against the pre-migration source for every migrated script;
      unchanged (Optique's strict rejection of unknown flags and of non-numeric `integer()` input is
      the only intentional behaviour change)
- [x] `docs/spec/cli-tooling.md` written — the MUST-use rule, the `runScript` API, pattern table,
      and the gotchas that actually bite
- [x] `bun run check` green across the migration's blast radius: `typecheck - backend` / `- frontend` /
      `- coverage` / `- scripts`, `format - dprint`, `plan - validate`, `size - check` / `- strict`,
      `context - weight`, `fuzz - generated tests`, `api - doc drift`, `changelog - gate`,
      `dead - code (knip)`, `coverage - per-module line %`, `e2e - browser (baseline)`,
      `plan - matrix`, `code-map - freshness`, `backlog - index`, `plan - ticket index (sync)`
- [ ] `lint - eslint` and `tests - coverage gaps` are red on `src/utils/content-hash.ts`
      (2 `padding-line-between-statements` errors + the untested `dedupeByHash` export). That file
      belongs to a concurrent session's content-dedup work and is not part of this migration; it was
      left untouched deliberately rather than fixed here.
- [x] `src/cli/valueparsers.ts` and `src/cli/log.ts` dropped rather than built — Optique ships a full
      value-parser catalog and no call site needed a project-specific wrapper or an `onExit` logger
      bridge. Recorded under the epic's "Deliberately not built".

## Files Touched

```
.plan/epics/epic-cli-tooling-optique.md            (research, plan, status)
.plan/tickets/TASK-optique-cli-tooling-integration.md  (this file)
docs/spec/cli-tooling.md                          (new — house spec + MUST-use rule)
src/cli/parser.ts                                 (new; re-export surface widened to argument/multiple)
src/cli/parser.test.ts
src/scripts/version-bump.ts
src/scripts/commit-check.ts
src/scripts/backfill-users-encryption-secret.ts
src/config/migrate-config.ts
src/build/compress.ts
src/aux-pipeline/eval/cli.ts
scripts/build-verify.ts, check-changelog.ts, check-context-weight.ts, check-file-size.ts,
  check-frontend-banned-patterns.ts, check-licenses.ts, check-spdx.ts, audit-runtime-compat.ts,
  gen-deno-config.ts, gen-pkg-from-deno.ts, generate-schema-fuzz.ts, i18n-reconcile.ts,
  run-benchmarks.ts
scripts/plan/normalize-statuses.ts, normalize-plan-metadata.ts, epic-owner-pick.ts
scripts/check/coverage.mjs, weave-damage.mjs, api-doc-drift.mjs, jscpd-ratchet.mjs, test-gaps.mjs
scripts/build-frontend.mjs                         (update caller)
colocated *.test.ts / *.test.mjs                  (one per migrated script)
package.json                                       (+ 2 deps)
bun.lock                                          (auto)
```