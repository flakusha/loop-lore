<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Context window reorders messages sharing an identical createdAt

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** Context window reorders messages sharing an identical createdAt
**Context:** Imported from git issue d3c44af (import-back); the registry issue body carries the full description.
**Acceptance Criteria:** As specified in git issue d3c44af.
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

Imported from git issue d3c44af.

git issue: d3c44af
