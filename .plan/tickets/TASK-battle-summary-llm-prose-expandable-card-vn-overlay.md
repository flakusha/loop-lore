<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Battle summary: LLM prose + expandable card + VN overlay

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Follow-up to D4-B/D4-C. Deterministic template summary ships as the fast track (D4-A, buildBattleSummary). Full-featured solution: (B) LLM prose summary of battle.log with generation cost/latency budget, fallback to the deterministic template on failure; (C) expandable summary card with click-to-expand log and VN choice-card styling across web/TUI/egui frontends. Blocks on representation-decision ticket aeb002e.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
