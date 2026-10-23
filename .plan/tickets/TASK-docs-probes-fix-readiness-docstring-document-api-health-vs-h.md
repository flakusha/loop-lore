<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: docs(probes): fix readiness docstring; document /api/health vs /health/* for load balancers

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-auth-config-contracts

**Summary:**

Sources: stream-c #10 (narrowed: boot already runs migrations before serve, so the missing migration check is a marginal drift window, not a live hole). Where: src/routes/liveness.ts:8 (docstring) vs :31-38 (SELECT 1); src/routes/health.ts:34-39 (always-200); src/server/start.ts:16. Gap: the readiness docstring promises DB reachable + migrations present but checks SELECT 1 only; health.ts designates /api/health for LBs but nothing contrasts it with the 503-capable opt-in `/health/*` probes; document the choice. Acceptance: docstring corrected (or a migration-presence check added); operator docs contrast /api/health with the 503-capable `/health/*` probes for the LB choice. Priority: low - docs; practical readiness gap is marginal since migrations run at boot. Verified 2026-10-11: LB designation exists (health.ts:8); narrowed to contrast-with-probes guidance.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
