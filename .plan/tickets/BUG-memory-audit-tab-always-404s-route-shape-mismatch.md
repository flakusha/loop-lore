<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Memory audit tab always 404s — route shape mismatch

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

SYMPTOM: The memory panel's audit tab always errors/404s, so the audit list is never populated and the memory-audit-filter-* buttons have nothing to narrow.

ROOT CAUSE: The panel (memoryPanelAudit.loadAudit → _auditUrl) requests GET /api/v1/actors/:actorId/memories/audit?limit=25 (actor-level list). The backend mounts per-memory GET .../memories/:memoryId/audit (src/routes/memory-audit.ts:56), so the URL resolves against the generic entity-detail route with :memoryId="audit" and answers 404.

EVIDENCE: Probe:
HTTP 404 .../api/v1/actors/a4888ade-.../memories/audit?limit=25
HTTP 404 .../api/v1/actors/a4888ade-.../memories/audit
error: evaluate: Error: HTTP 404: Not Found

FIX DIRECTION: Add an actor-level GET .../memories/audit route, or repoint the panel's _auditUrl at the per-memory route.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
