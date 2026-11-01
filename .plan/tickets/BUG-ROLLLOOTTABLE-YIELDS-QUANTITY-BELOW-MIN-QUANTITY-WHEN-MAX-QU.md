<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: rollLootTable yields quantity below min_quantity when max_quantity < min_quantity

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** RollLootTable yields quantity below min_quantity when max_quantity < min_quantity
**Context:** Imported from git issue 9f2f175 (import-back); the registry issue body carries the full description.
**Acceptance Criteria:** As specified in git issue 9f2f175.
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

Imported from git issue 9f2f175.

git issue: 9f2f175
