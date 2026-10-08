<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Regression process — crash classification, minimization, fix verification

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** Fuzzing Infrastructure

**Summary:**

Build the regression workflow for fuzzing crashes: (1) classification — severity triage (low/medium/high/critical), root cause categorization, duplicate detection against existing known-crash corpus; (2) minimization — delta-debugging to find smallest repro input; (3) fix verification — replay crash input against fixed build to confirm resolution, re-fuzz to check for regression. Integrates with `FuzzCrash.reproducible` and the per-iteration timeout (1s) / OOM (512MB) constraints. Findings feed into `epic-core-testing-frameworks.md` security-test layer.

**Context:**

A crash found by fuzzing is not fixed until it is reproduced, classified, minimized, and verified fixed. The regression workflow closes that gap: severity triage routes findings to the right severity lane (low/medium/high/critical), root cause categorization prevents the same bug from being investigated as two different bugs, delta-debugging minimization produces the smallest repro input, and fix verification replays the crash against the patched build to confirm resolution. `FuzzCrash.reproducible` already captures whether a crash reproduces deterministically; this ticket builds the workflow around that field.

Constraint: minimization must respect the per-iteration timeout (1s) and OOM constraint (512MB) — large repro inputs that barely fit in memory may not minimize cleanly under those budgets. The crash dedup key (stack trace + input hash from the harness runner) is the canonical identity for duplicate detection; any classification system must not create a separate identity that diverges from it.

Alternative: handle crashes manually — reproduce in dev, classify by eye, minimize by hand, verify by re-fuzzing. Accepted for the first few crashes; rejected at scale. As the cluster finds dozens of crashes, manual handling becomes a bottleneck that delays fix verification and allows duplicates to consume investigator time repeatedly.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
