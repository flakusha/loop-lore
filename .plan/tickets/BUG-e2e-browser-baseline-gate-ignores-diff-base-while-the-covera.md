<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: e2e - browser (baseline) gate ignores --diff-base while the coverage gate honors it

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Tags:** check-gates, e2e

**Summary:**

**Summary:** The `e2e - browser (baseline)` gate is a literal string with no diff awareness, while the coverage gate in the same registry is diff-scoped and self-skips. `AGENTS.md:37-40` documents that `bun run check --diff-base <ref>` scopes the heavy gates to the branch diff; the browser gate silently does not honor that contract. Correctness bug, not only a slow gate.

## The asymmetry (verified at gitHead bc3b89ee8)

- `scripts/check-parallel.mjs:339` — `"e2e - browser (baseline)": "bun run test:e2e:browser"` — a plain literal. `DIFF_BASE` appears at exactly four places in the file: `:109` (parse), `:249` (`changedFiles`), `:256` (scoped src filter), `:476` (plain-mode branch test). None of them is the e2e gate.
- `scripts/check-parallel.mjs:333` — `"coverage - per-module line %": NOOP_OK` is a placeholder, replaced before the run at `:530` by `coverageCommand()` (`:472-503`), which consults `CHANGED` (`:249-257`) and returns `NOOP_OK` (`:258`, the literal `true # diff-scope: no matching files`) at `:485`, `:490`, `:491`, `:496` when nothing in the diff matches.

The coverage gate is correct and is the model. It is not part of this report.

## Measured evidence — same diff, same run

Report: `/home/flak/git-ai/loop-lore/.tmp/check-report-169005-mupfhoa2.json` (runId `169005-mupfhoa2`, gitHead `bc3b89ee8`, branch `dev`, summary durationMs 307626).

- coverage gate: command `true # diff-scope: no matching files`, `durationMs: 1`
- `e2e - browser (baseline)`: command `bun run test:e2e:browser`, `durationMs: 134171` (134.2s) — 43.6 percent of the 307.6s run

On one identical diff the coverage gate self-skipped in 1ms while the browser gate ran in full. The report does not mark the e2e gate as skipped, so the 134.2s is genuinely paid on every finalize.

## Root: `scripts/run-browser-tests.ts` takes no diff input

`scripts/run-browser-tests.ts:11-20` reads `tests/e2e/flows/browser`, filters `.browser.ts`, and `:24-40` loops `Bun.spawn(["bun", "test", "--max-concurrency=1", file])` per file — serial, no filter, no argv, no env hook. The directory currently holds exactly 35 `.browser.ts` files. One process per file at `--max-concurrency=1` is why the gate costs 97-300s.

## Why this is a correctness bug

`AGENTS.md:37-40` documents the runner contract: `bun run check --diff-base <ref>` scopes unit + coverage gates to the branch diff, and `giwt finalize` Step 2 passes this automatically. giwt does forward the flag (`src/commands/finalize.ts:981-992` appends `--diff-base <merge-base>` to the target repo check command), but the e2e gate is the one heavy gate the runner never scopes. So every finalize pays the full browser suite even when the branch diff touches no browser-relevant code, and documentation and behaviour disagree with nothing in the report telling the reader which is authoritative.

## Suggested shape of the fix

Give the e2e gate the same placeholder treatment the coverage gate has: register it as `NOOP_OK` in the registry, build it in a function that takes `CHANGED`, and map diff-touched files onto browser flow files the way `scopedCoveragePaths()` (`:235-247`) maps changed src files onto modules. When nothing matches, return `NOOP_OK` — the `true # diff-scope: no matching files` shape — so the gate self-skips exactly as coverage does.

## Risk any fix must address: err toward running

Browser e2e flows are not reliably isolated per file. In-tree tickets already record cross-file coupling and shared state (for example `BUG-demo-login-e2e-fails-in-full-suite-order-due-to-unreset-per-...` and `BUG-browser-e2e-suite-flakes-under-concurrent-runs`). A per-file diff filter that assumes each `.browser.ts` file independently covers its subject can silently skip a suite that a change did affect. Selection must be conservative: when the mapping from a changed path to a flow is ambiguous or unknown, run the full suite. A false skip is a silent correctness hole; a false run only costs time.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
