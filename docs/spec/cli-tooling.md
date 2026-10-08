<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# CLI Tooling Specification

Every command-line entry point in this repo parses its arguments through one shared wrapper,
`src/cli/parser.ts`, which is a thin layer over [Optique](https://optique.dev/)
(`@optique/core` + `@optique/run`). The parser describes the grammar; the result type is inferred
from it. There is no separate result interface to keep in sync, and no hand-rolled flag detection,
value coercion, or default handling.

## The rule

Any entry point under `src/scripts/`, `src/config/`, `src/build/`, `src/aux-pipeline/`, or
`scripts/` that reads argv **MUST** use `src/cli/parser`. Hand-walking `process.argv` or
`Bun.argv`, or reimplementing flag detection and defaults inline, is **not** allowed.

This covers both new code and modifications to existing entry points: adding a flag to a script
that still parses argv by hand means migrating the script, not extending the ad-hoc parser.

## Quick start

```ts
import { flag, object, runScript, withDefault, } from "../src/cli/parser";

const parser = object({
  dryRun: withDefault(flag("--dry-run",), false,),
  verbose: withDefault(flag("--verbose",), false,),
});

const args = runScript(parser, {
  programName: "my-script",
  brief: "One-line description shown at the top of --help.",
  help: "option",
});
```

`runScript` reads `process.argv.slice(2)` by default. It renders `--help` and `--version` itself,
applies colours only when stdout is a TTY, and exits with `errorExitCode` (default `1`) when
parsing fails. Callers narrow the result with TypeScript inference — there is nothing to annotate.

Imports use no file extension. From `scripts/*.ts` the path is `../src/cli/parser`; from
`scripts/check/*.mjs` and `scripts/plan/*.ts` it is `../../src/cli/parser`. A `.mjs` script may
import this `.ts` module directly under Bun.

## API

### `runScript(parser, options)`

| Option | Type | Purpose |
| ------ | ---- | ------- |
| `programName` | `string` | Name shown in usage/help. Defaults to the `process.argv[1]` basename. |
| `brief` | `string` | One-line summary at the top of `--help`. |
| `description` | `string` | Longer prose after the usage line. |
| `examples` | `string` | Usage examples appended to `--help`. |
| `version` | `string` | Enables `--version` / the `version` subcommand. |
| `help` | `"command" \| "option" \| "both"` | Enables `--help` and/or a `help` subcommand. |
| `completion` | `"command" \| "option" \| "both"` | Enables shell completion for bash/zsh/fish/pwsh/nu. |
| `showDefault` | `boolean` | Render default values in `--help`. |
| `errorExitCode` | `number` | Exit code on parse error. Defaults to `1`. |
| `args` | `readonly string[]` | Explicit argv override. Defaults to `process.argv.slice(2)`. Exists for tests. |

### Re-exports

Combinators: `argument`, `flag`, `multiple`, `object`, `option`, `optional`, `withDefault`.
Value parsers: `choice`, `integer`, `string`.
Types: `InferValue`, `Mode`, `Parser`.

Add a symbol to this list only when a real call site needs it. Do not speculatively re-export the
wider Optique surface — the point of the module is that callers import from one narrow place.

## Patterns

| Need | Parser |
| ---- | ------ |
| Boolean flag | `withDefault(flag("--fix",), false,)` |
| String option with a default | `withDefault(option("--locale", string(),), "en",)` |
| Numeric option | `withDefault(option("--limit", integer(),), 250,)` |
| Enum option | `option("--format", choice(["toml", "yaml"],),)` |
| Optional positional | `optional(argument(string(),),)` |
| Positional with a default | `withDefault(argument(string(),), "src/frontend",)` |
| Trailing variadic paths | `multiple(argument(string(),),)` |

`option("--x", …)` accepts both `--x=V` and `--x V`.

## Gotchas

**Unknown options are a hard error.** Optique exits `1` on any argument the parser does not
declare. Hand-rolled `argv.includes(...)` code silently ignored them, so a migration can break a
caller that was quietly passing an extra flag. Before writing a parser, enumerate every real
invocation — the `package.json` scripts entries, the gate registry
`scripts/check/parallel/gates.mjs`, and `.github/workflows/` — and make sure every flag any of
them pass is declared.

**Parse failures cannot be caught in-process.** `runScript` calls `process.exit` on a parse error
and on `--help` / `--version`. Failure paths must be tested by spawning the script as a child
process and asserting its exit code and stderr.

**`integer()` rejects junk.** Older code used `parseInt(v) || 80`, which silently substituted the
default on non-numeric input. A migration tightens this deliberately: the default still applies when
the option is absent, but an unparseable value is now an error.

**Only call `runScript` from a real entry point.** It reads `process.argv` by default. A module that
is imported rather than executed would parse its *importer's* argv, so it must not call `runScript`
at module scope. If a script needs both roles, parse inside the function that actually runs.

**Gate scripts own their output.** For anything under `scripts/check/`, stdout and the exit code
*are* the result the parallel runner consumes. Preserve them exactly when changing the parser.

## Testing

Add a colocated `*.test.ts` next to the script (`.test.mjs` for an `.mjs` script), following the
`scripts/check/test-gaps.test.mjs` precedent. Spawn the script as a child process and assert exit
code plus a stdout/stderr substring; do not snapshot whole `--help` output, which is brittle.

Tests run under `bun test --parallel=N --isolate`, so they must be parallel-safe: give each test its
own temporary directory rather than a shared fixed path, clean up in a `finally` / `afterEach`, and
keep them independent of execution order. Scripts that write to the repo (`.plan/` mutators, baseline
updaters) must be exercised only in their `--check` / `--dry-run` mode, or against a temp copy.

Gates auto-discover tests under `src/` and `tests/e2e/` only, so a colocated `scripts/*.test.ts`
runs under bare `bun test` and `bun run test` rather than the scoped unit gate. That matches how
existing script tests are already wired.

## Epics

- `.plan/epics/epic-cli-tooling-optique.md`
- `.plan/epics/epic-tooling-improvement.md`
- `.plan/epics/epic-script-migration.md`
