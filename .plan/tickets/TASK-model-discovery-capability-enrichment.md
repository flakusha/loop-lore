<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: model discovery capability enrichment

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Discover models from harness session/new configOptions; merge with static capability table (src/admin/model-capabilities.ts) for modalities/context window; no capability fields in discovery. Caveats: TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-11-05 registry-driven close: git issue a78f091 (registry tip: 683a98518 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-MODEL-DISCOVERY-CAPABILITY-)
