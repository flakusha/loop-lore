<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Environment kit background and props tier

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-scene-environment-world-generation
**Tags:** scene, comfyui, assets
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Background/prop generation tier: prompt assembly from location description plus lore (memory-budget-style); generate-or-reuse gate (content hash plus pHash-class similarity once available, tag overlap otherwise). AC: re-running kit generation for an unchanged location reuses existing assets (no duplicate spam, dedup by hash); prompt assembly respects the budget cap; NSFW policy applies.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
