<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: immersion gate failed-check enforcement

**Status:** Done
**Priority:** high
**Epic:** epic-immersion-consistency-gate
**Tags:** immersion
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

WI-3 of epic-immersion-consistency-gate: consume battle/dice failed-check outcomes (src/battle/resolution-integration/checks.ts, src/rpg/dice) as pending-consequence state that constrains follow-up actor claims until resolved. See .plan/epics/epic-immersion-consistency-gate.md.

**Context:**

Today skill-check outcomes reach the narrative only through prompt context; nothing consumes a failed check to constrain the next user action. This ticket adds the pending-consequence state and its consumption as gate input.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
