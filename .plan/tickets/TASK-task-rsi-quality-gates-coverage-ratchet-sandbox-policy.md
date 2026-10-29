<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: TASK-rsi-quality-gates-coverage-ratchet-sandbox-policy

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-testing-qa

**Summary:**

Owner epic: `.plan/epics/epic-testing-qa.md`

## Background

- Coverage gate: `scripts/check/coverage.mjs:37-60` (`--floor`, `--files=` diff mode; per-file flooring), `:101-107` diff-file mode, `:109-124` module aggregates + floor/SKIP table.
- Ratchet-adjacent precedent: `scripts/check/jscpd-ratchet.mjs` + `jscpd-baseline.json`; `scripts/check/test-gaps.mjs` + baseline; `scripts/check/coverage/waivers.mjs` per-module floors. But no `coverage-baseline.json`, no `coverage-ratchet.mjs`, no `banned-patterns.mjs` gate.
- Property dep already vendored: `package.json:238` (`fast-check ^4.10.2`).

Established solutions: StrykerJS nightly-only pattern (too slow per-PR) - https://stryker-mutator.io/docs/stryker-js/configuration/ ; per-module mutation-score ratchet precedent - https://github.com/open-gsd/gsd-core/pull/1200 . Full sandbox-policy engine + auto-rollback DEFERRED until the safe-harness ticket (db-snapshot primitive) lands.

## Change

1. `coverage-baseline.json` (per-module line/branch pct) + `scripts/check/coverage-ratchet.mjs` - fail if any module drops below baseline minus epsilon (1 pct); `bun run coverage:ratchet` regenerates baseline; MRP surfaces per-PR delta.
2. `scripts/check/banned-patterns.mjs` - grep gate over `.agents/references/banned-patterns.md` + secrets-in-patch scanner as pre-commit in worktree.
3. `protected-paths.json` + patch caps (<=5 files / <=200 lines default; `src/crypto/`, auth, `migrations/` append-only, workflows, gate runner require human approval) consulted by finalize.
4. Wire three gates into `gate-table.mjs` (ratchet blocking, secrets/banned blocking, Stryker nightly advisory).

## Acceptance

- Lowering any module below baseline fails gate; unrelated-module drop does not false-positive on diff-scoped runs.
- Patch touching `src/crypto/` without human approval blocked even when tests green.
- Secret-pattern fixture blocked at pre-commit; nightly Stryker on one fixture file reports surviving mutant as agent-actionable signal.

**Caveats:** TOCTOU: ratchet compares the exact committed diff. Security: secrets scanner is backstop only, keep allowlist path. Authorization: protected-paths approval must be human, never self-approved. Parallelism: baseline regeneration serialized. Partial failure: failing new gate must not mask others. Rollback: baseline bumps are explicit revertible commits. Observability: per-PR delta comment on every run.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
