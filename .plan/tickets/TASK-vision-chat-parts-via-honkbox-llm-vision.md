<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Vision chat parts via honkbox llm-vision

**Status:** Blocked
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-chat-product-features
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Scope: data-URI image_url parts only; text-only model gets named vision_unsupported, never flattened. AC: no silent text fallback. Depends: honkbox T3 release feature set with llm-vision.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
