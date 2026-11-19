<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Coverage must bucket `packages/core` modules separately

**Status:** Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-cicd-pipeline
**Caveats:** partial failure, stale state, observability

**Context:**

Collapsing `packages/core` hides module-level regressions; bucket its modules separately.

**Summary:**

Coverage aggregation collapses all `packages/core` modules into one bucket, hiding module-level regressions.

**Evidence:**

- Research-cited coverage aggregation behavior under `scripts/check/coverage/`.
- Fresh lcov evidence cited in `.tmp/research/tomorrow-followups-2026-11-21.md`.

**Scope:**

- Bucket `packages/core/src/<module>` separately.
- Preserve existing project-wide reporting behavior.
- Add or update a regression test proving that core modules are not collapsed.

**Acceptance Criteria:**

- [ ] Core modules have separate coverage buckets.
- [ ] A regression test fails if the buckets collapse again.

git issue: 153d530

- [ ] Coverage/check gates pass for the affected scope.
