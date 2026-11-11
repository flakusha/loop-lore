<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: 1.0.0 THEME 1: Operator-correct agentic runtime (harness ladder first)

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

Rationale: Composition root exists on branch but dispatch is miswired: blanket ToS guard skips all subscription-backed profiles and the isolation gate reads file config instead of the admin effective view. Land BUG 369e695 (effective view) then 137cfa0 (ToS scoping) before any 3.3 feature work.

Feeds: next-epic-selection-2026-11-04 §§1-3 (rank 1); acp-composition-root / acp-strategy-enum / plan-harness-tickets branches; epic-external-harness-acp §3.3; epic-principal-scoped-credentials (rank 2, unblocks); epic-agentic-integration-mcp-acp (rank 4, MCP-first after ladder)

AC1 Harness ladder: UI-toggled ack enables a subscription-backed profile with no config-file edit; enabled=false suppresses spawn; store-unavailable causes no downgrade; omp/opencode select with no ack while codex/claude-code still require it; tos_unacknowledged skip code + structured log unchanged; selector/isolation/admin-settings suites green with per-test reset (no leaked singletons).

Related: .tmp/research/release-1.0.0-roadmap.md
Scope note: serves Required harness/RSI/ACP-drivers/orchestration/model-grading-autoroute items.

**Caveats:** TOCTOU: ack toggle read at dispatch time; concurrent toggle mid-turn uses turn-start snapshot. Security: subscription-backed profiles require explicit ack; no silent widening. Authorization: isolation gate unchanged, admin-only execution. Parallelism: per-test store reset, no shared singletons. Partial failure: unseeded store falls back to file config, never open. Rollback: revert to file-config behavior by clearing overrides. Observability: tos_unacknowledged skip code + structured log.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
