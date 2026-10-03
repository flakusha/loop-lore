<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: The roots guard on PROJECT_ROOT/DIFF_ROOT is wired to no gate and no CI job

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

`scripts/check/parallel/roots.test.ts` is the only guard on the `PROJECT_ROOT` / `DIFF_ROOT` hop, and nothing runs it. It passes when a human invokes it by hand and is invisible to the gate runner and to CI.

The guard matters more than a normal test. The module split moved these modules from `scripts/` down to `scripts/check/parallel/`, two levels deeper, and the relative hops were bumped by one instead of two. Revert `PROJECT_ROOT` to its pre-split one-level `..` and the GPG pre-flight does `process.exit(1)` on **every** check run, while all 30 gates report success. `DIFF_ROOT` fails the same way but silently: diff-scoped discovery resolves every repo-relative path against `scripts/`, matches nothing, and reports success having run zero tests. A wrong-but-resolvable path is invisible to an import-resolution check, which is why the test exists.

## Enumerated: nothing invokes it

- The only gate whose command invokes `bun test` is `coverage - per-module line %` (`gates.mjs:239` replaces the `NOOP_OK` placeholder with `coverageCommand()`). Its command is built from `allPaths` in plain mode (`gates.mjs:192-197`: `["tests/e2e/", ...walkTestFiles(PROJECT_ROOT, "src",)]`) or from `SCOPED_COVERAGE_PATHS` in scoped mode (`gates.mjs:204-211`, built by `context.mjs:159-171`). `walkTestFiles` only descends `src/`; `changedModules()` filters `f.startsWith("src/")`. Neither can ever yield a `scripts/` path.
- CI runs `bun test src/` (`ci.yml:78`), `bun test tests/e2e/` (`ci.yml:110`), `bun test src/telemetry/` (`ci.yml:197`). None target `scripts/`.
- The root `test` script (`package.json:64`: `bun test --parallel=4 --isolate`, no path) discovers `src/` and `tests/`, not `scripts/check/parallel/`.

## Suggested direction

Add a standalone gate, e.g. `"check - roots": "bun test scripts/check/parallel/roots.test.ts"`.

**Do not fold it into the coverage gate.** Two reasons, and the second corrects a plausible-sounding assumption:

1. The coverage gate's command is *built* from `SCOPED_COVERAGE_PATHS` / the `src/` walk, not a static list, so a `scripts/` path cannot be threaded through it without rewriting the builder.
2. The floor is **per-module, not global** — `coverage.mjs:86-101` groups lcov records by top-level `src/` dir via `aggregateModules()` (`lcov.mjs:30-49`) and floors each module independently: `rows.filter((r,) => inScope(r.mod,) && !waivedSet.has(r.mod,) && r.pct < floor)`. So a `scripts/` test file would not have distorted a *global* floor as feared. But it would still be wrong, for a different reason: `scripts/` paths never appear in an lcov record's `SF:` grouping, and in diff-file mode (`--files=`, `diff-mode.mjs:78`) the floor is **per-file** with unmeasured files counted as `skipped` rather than failures. Mixing a constant-assertion test file into a coverage-floor gate couples two unrelated contracts; a separate gate keeps the failure modes legible.

Note the gate is cheap: the file is a resource contract test (asserts on module-level constants, allocates no tmp file, port, or database), so it needs no heavy-gate scheduling.

## Acceptance Criteria

- [ ] A gate in `scripts/check/parallel/gates.mjs` runs `scripts/check/parallel/roots.test.ts`
- [ ] Reverting `PROJECT_ROOT` to the one-level hop makes `bun run check` fail on that gate (proves the gate is wired, not decorative)
- [ ] The gate is not folded into `coverage - per-module line %`

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
