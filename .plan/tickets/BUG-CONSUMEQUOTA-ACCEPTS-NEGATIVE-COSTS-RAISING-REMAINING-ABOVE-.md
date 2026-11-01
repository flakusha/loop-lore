<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: consumeQuota accepts negative costs, raising remaining above the limit

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** ConsumeQuota accepts negative costs, raising remaining above the limit
**Context:** Imported from git issue e63c04c (import-back); the registry issue body carries the full description.
**Acceptance Criteria:** As specified in git issue e63c04c.
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

Imported from git issue e63c04c.

git issue: e63c04c
