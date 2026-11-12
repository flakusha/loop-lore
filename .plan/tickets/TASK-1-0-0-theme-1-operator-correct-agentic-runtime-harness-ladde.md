<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: 1.0.0 THEME 1: Operator-correct agentic runtime (harness ladder first)

**Status:** Done
**Priority:** high
**Effort:** Medium

**Summary:**

Rationale: Composition root exists on branch but dispatch is miswired: blanket ToS guard skips all subscription-backed profiles and the isolation gate reads file config instead of the admin effective view. Land BUG 369e695 (effective view) then 137cfa0 (ToS scoping) before any 3.3 feature work.

Verified 2026-11-12 on dev @ 9202c0842: both blockers are LANDED — `671ab70ab` (isolation gate + selector read the effective admin view via `isHarnessAdminSettingsSeeded`/`getHarnessAdminSettings`, seeded/unseeded fallback covered in `isolation-gate.test.ts` + `profile-selector.test.ts`) and `a6cbfcde1` (ToS guard scoped to subscription-backed flavors via `providerTosGated`: omp/opencode/hermes/openclaw ungated, codex/claude-code gated; `tos_unacknowledged` skip code + structured log in `profile-selector.ts:188-193`). AC1 verified present in tree; remaining work is the verification-pass suites + doc updates, not implementation.

Feeds: next-epic-selection-2026-11-04 §§1-3 (rank 1); acp-composition-root / acp-strategy-enum / plan-harness-tickets branches; epic-external-harness-acp §3.3; epic-principal-scoped-credentials (rank 2, unblocks); epic-agentic-integration-mcp-acp (rank 4, MCP-first after ladder)

AC1 Harness ladder: UI-toggled ack enables a subscription-backed profile with no config-file edit; enabled=false suppresses spawn; store-unavailable causes no downgrade; omp/opencode select with no ack while codex/claude-code still require it; tos_unacknowledged skip code + structured log unchanged; selector/isolation/admin-settings suites green with per-test reset (no leaked singletons).

Related: .tmp/research/release-1.0.0-roadmap.md
Scope note: serves Required harness/RSI/ACP-drivers/orchestration/model-grading-autoroute items.

**Caveats:** TOCTOU: ack toggle read at dispatch time; concurrent toggle mid-turn uses turn-start snapshot. Security: subscription-backed profiles require explicit ack; no silent widening. Authorization: isolation gate unchanged, admin-only execution. Parallelism: per-test store reset, no shared singletons. Partial failure: unseeded store falls back to file config, never open. Rollback: revert to file-config behavior by clearing overrides. Observability: tos_unacknowledged skip code + structured log.

**Context:**

Verified 2026-11-12: AC1 implementation is present on dev (see Rationale note). Harness suites green: isolation-gate + profile-selector + admin-settings + provider-tos + routes/harness + admin-harness-settings (95 tests, 2026-11-12). Docs: `docs/frontend/admin.md` ## Harness (enable switch, ToS matrix, run telemetry).

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated (`docs/frontend/admin.md` ## Harness: enable switch, ToS matrix, run telemetry; 2026-11-12)
