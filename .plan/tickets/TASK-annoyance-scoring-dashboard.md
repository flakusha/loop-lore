<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: annoyance-scoring-dashboard

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-observability-telemetry
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Implicit (regenerate/edit/abandon/retry/tool-reject) + explicit (thumbs) signal aggregation with per-user baselines, per-feature splits, 7-day trend; aggregate-only default with hashed ids; admin endpoint. No auto-prompt-mutation (advisory hints only). Owner epic: epic-observability-telemetry. Anchors: src/telemetry/service.ts; src/telemetry/config.ts; src/telemetry/annoyance.ts does NOT exist (new surface). Refs: https://posthog.com/docs/product-analytics (event taxonomy + rage-click playbooks, adapt into local telemetry_events); https://promptfoo.dev (CI gating patterns). Acceptance: aggregation with baselines/splits/trend; aggregate-only default; admin endpoint; no auto-mutation. DEFER: PostHog dependency (local-first). Source: internet-expansion research 2026-10-29.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
