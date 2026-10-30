<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Emotion-avatar regen atomicity and subset regression tests

**Status:** In Progress
**Scope:** Emotion-Avatar Completion
**Priority:** medium
**Effort:** Medium
**Epic:** epic-avatar-regeneration-control
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Regression tests for the regen-control epic's open Tests work item:
subset regeneration, replace atomicity, and outfit-scope isolation.

**Context:**

Epic: epic-avatar-regeneration-control (open work item: Tests). The
generation paths live in
`src/characters/services/emotion-avatar-service/` (single-generation,
run-batch-generation, seed) with `src/routes/wardrobe-avatars.ts` for
outfit-scoped regeneration.

**Approach**

- Subset regen: an emotions filter re-rolls ONLY the requested slots;
  sibling slots keep their asset ids.

- Replace atomicity: the old variant is never unbound mid-flight; a
  failure keeps the old binding.

- Outfit-scope isolation: outfit-scoped regeneration does not touch
  slots outside the outfit scope.

**Acceptance Criteria:**

- [ ] Subset test asserts untouched sibling slots keep asset ids
- [ ] Failure-injection test proves the old variant stays bound until
  the new one commits

- [ ] Outfit-scoped isolation test
- [ ] Tests green in the default suite (no --isolate)
