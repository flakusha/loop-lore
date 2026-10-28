<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: immersion gate config surface and audit log

**Status:** Done
**Priority:** high
**Epic:** epic-immersion-consistency-gate
**Tags:** immersion
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

WI-6 of epic-immersion-consistency-gate: per-chat severity (allow/annotate/soft-refuse/hard-block) + per-rule toggles in the src/config/sections pattern (single-source defaults, schemas mirror); append-only decision-log table via new migration; audit rows record input claims, state snapshot, verdict, severity, engine attribution. See .plan/epics/epic-immersion-consistency-gate.md.

**Context:**

The severity ladder is design-only today and the decision log required by the audit acceptance criterion has no storage table. Migration must be a fresh append-only NNN number on this branch; services never import DB modules (Kysely types only).

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
