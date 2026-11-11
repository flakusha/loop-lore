<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: 1.0.0 THEME 6: Release cadence: fast, trustworthy finalize

**Status:** Not Started
**Priority:** low
**Effort:** Medium

**Summary:**

Rationale: Scoped finalize costs ~15 min with the SOLO tail at 63% (e2e-browser alone 60%) and type-coverage as the light-pool critical path; dev-checkout dirt blocks giwt finalize for all branches. A 1.0 cadence needs the measured speedups plus queue hygiene — research-only, no product scope.

Feeds: finalize-speedup.md §1 baseline (886s scoped; 529.8s browser; 188.8s type-coverage); next-epic-selection §4 (dev-dirt finalize block, stacking/base discipline)

AC8 Release hygiene: scoped finalize within the 1-5 min target (or documented critical-path reduction with e2e-browser off the critical path); plan-validate clean — zero duplicate/contradictory Status lines, no stale Not-Started on shipped code.

Related: .tmp/research/release-1.0.0-roadmap.md
Scope note: serves Desirable finalize/gate speedups; research-only, no product scope.

**Caveats:** TOCTOU: check timings vary per run; baseline is advisory. Security: research-only, no code changes. Authorization: n/a. Parallelism: measurement runs serialized to avoid skew. Partial failure: speedup slices land independently. Rollback: n/a, docs only. Observability: check-report.json is the evidence artifact. (research-only)

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
