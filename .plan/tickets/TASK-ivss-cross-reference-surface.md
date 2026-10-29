<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: IVSS cross-reference surface

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-image-video-scenario-studio
**Tags:** ivss, lineage, worlds
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Used-in backlinks plus scenario references from chats (session-to-scenario cross-ref), riding the lineage query/propagation tickets. Chats reference scenarios, never copy. AC: regenerating an asset marks downstream scenes stale within one write (lineage propagation policy); a chat can pin a scenario reference without copying it.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
