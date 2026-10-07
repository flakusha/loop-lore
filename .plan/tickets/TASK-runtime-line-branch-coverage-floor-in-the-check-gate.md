<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Runtime line/branch coverage floor in the check gate

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Only type-coverage (85%) is gated. TASK-test-runtime-coverage calls for a runtime floor. The per-module line gate exists but is known-flaky for autonomy (79.79% to 82.52% on byte-identical code). Establish the floor after the flake is fixed.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] autonomy flake root-caused (leaked global state per bun-test-global-state-leak) before gating.
- [ ] Runtime line/branch floor enforced in scripts/check/coverage.mjs with documented waivers.
- [ ] Gate deterministic across 3+ serial (CHECK_JOBS=1) runs on unchanged code.
- [ ] bun run check green.

**Related:** scripts/check/coverage.mjs, .plan/epics/epic-testing-qa.md
