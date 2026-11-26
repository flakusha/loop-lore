<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Decide ticket index split timing

**Status:** Done
**Priority:** high
**Effort:** Small

**Summary:**

Decide whether the oversized .plan/tickets/index.json is split before or after release 1.0.0.

**Context:** Operator ruling 2026-11-19: the split is required before 1.0.0, overriding the earlier post-release recommendation. Sync-tooling changes belong in the giwt repo; the loop-lore cutover is tracked separately.

**Acceptance Criteria:**

- [x] Ruling recorded in the 1.0.0 tracker.
- [x] Follow-up implementation ticket filed (`TASK-split-ticket-index-before-1-0-0.md`, issue `f7e7988`).
- [x] Tracker open-question entry resolved.

**Caveats:** TOCTOU: n/a, decision only. Security: n/a. Authorization: operator decision. Parallelism: none. Partial failure: n/a. Rollback: n/a. Observability: tracker is source of truth.
