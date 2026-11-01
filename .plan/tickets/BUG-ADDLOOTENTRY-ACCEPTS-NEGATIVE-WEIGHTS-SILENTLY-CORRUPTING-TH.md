<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: addLootEntry accepts negative weights, silently corrupting the loot distribution

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** AddLootEntry accepts negative weights, silently corrupting the loot distribution
**Context:** Imported from git issue e667754 (import-back); the registry issue body carries the full description.
**Acceptance Criteria:** As specified in git issue e667754.
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

Imported from git issue e667754.

git issue: e667754
