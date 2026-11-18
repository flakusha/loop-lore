<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Decide ticket index split timing

**Status:** Not Started
**Priority:** high
**Effort:** Small

**Summary:**

Decide whether the oversized .plan/tickets/index.json is split before or after release 1.0.0.

**Context:** The index remains a tracked sync snapshot; the release tracker lists the split timing as an open question. Splitting during the release changes sync tooling, so the operator must pick the window.

**Acceptance Criteria:**

- [ ] Ruling recorded in the 1.0.0 tracker.
- [ ] Follow-up implementation ticket filed if the split lands before the release.
- [ ] Tracker open-question entry resolved.

**Caveats:** TOCTOU: n/a, decision only. Security: n/a. Authorization: operator decision. Parallelism: none. Partial failure: n/a. Rollback: n/a. Observability: tracker is source of truth.
