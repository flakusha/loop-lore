<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Freeze StoryEvent as versioned src type (engine SDK prerequisite)

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Promote the StoryEvent fenced snippet in .plan/epics/epic-embeddable-backend.md:45-52 to a versioned src/ type (grep StoryEvent across src;packages returns 0 matches). Required before any per-engine SDK: typedoc/gdtoolkit-doctool generation, OpenAPI-drift-gate precedent (scripts/check/parallel/gate-table.mjs:129-133). Include id/type/payload/timestamp envelope + delivery semantics (WS orders, no redelivery across reconnects; lastEventId cursor). Source: .tmp/research/game-engine-integration-review.md blockers.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
