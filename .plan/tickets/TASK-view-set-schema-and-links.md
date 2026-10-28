<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: View-set schema and links

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-view-set-generation
**Tags:** views, db, assets
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Migration for view_sets and view_set_items tables plus an AssetLinkEntity ViewSet value, enums (set status, tier, lane), insert helpers, and db sync artifacts. AC: migration up/down/round-trip green; creating a set with two items and linking it to a character surfaces on the character asset listing; orphan items rejected (FK plus CHECK exactly-one-lane).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
