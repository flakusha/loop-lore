<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Seed codex and claude model capability rows for harness enrichment

**Status:** Done
**Priority:** low
**Effort:** Small
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Harness model discovery enriches provider/id model ids from the admin model-capabilities table (src/integrations/harness/model-discovery.ts:104-149). The codex and claude-code adapters namespace bare wire ids as codex/`<preset>` and claude/`<modelId>` (src/integrations/harness/codex.ts, claude-code.ts), so enrichment looks those provider ids up — and finds nothing, leaving capabilities null while omp models enrich. Gap: seed/maintain capability rows for the namespaced providers (codex/*, claude/*) so discovered codex/claude-code models carry contextWindow/maxOutput/tool/vision/thinking facts like omp models do. Prefer the existing admin capability-table authoring surface over code changes; a test asserting enrichment for a namespaced id should pin the behavior.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-11-12 registry-driven close: git issue 2350e43 (registry tip: 630d045db Konstantin Fedotov Close issue)
