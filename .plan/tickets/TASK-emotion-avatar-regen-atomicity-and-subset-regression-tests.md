<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Emotion-avatar regen atomicity and subset regression tests

**Status:** Done
**Status Note:** [2026-10-30, worktree feat-emotion-avatar-completion] All three regression tests green in the default suite: subset re-roll leaves sibling asset ids untouched, failure-injection keeps the old variant bound, outfit-scoped replace never reaches other outfits or the base scope. No service changes needed — `runBatchGeneration` `replace` path already commits new avatars before unbinding olds (tests in `regen-atomicity.test.ts`, 3 pass). Scoped: `bun test src/characters/services/emotion-avatar-service/regen-atomicity.test.ts` (3 pass), `bun run typecheck` green.
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

- [x] Subset test asserts untouched sibling slots keep asset ids
- [x] Failure-injection test proves the old variant stays bound until
  the new one commits

- [x] Outfit-scoped isolation test
- [x] Tests green in the default suite (no --isolate)
