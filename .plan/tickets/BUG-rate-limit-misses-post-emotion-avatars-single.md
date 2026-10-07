<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Rate-limit misses POST /emotion-avatars/single

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

Evidence (approved finding 2, P2; .tmp/concern-dev-2026-10-07.md, .tmp/concern-auth.md): src/api-governance/rate-limiting/policies.ts:70-77 adds the suffix rule for /emotion-avatars -> generationPolicy, but POST /api/v1/actors/:actorId/wardrobe/:itemId/emotion-avatars/single (src/routes/wardrobe-avatars.ts:80-96, mounted at /api/v1 via src/routes/v1/actors-surface.ts:72) ends with /single and misses it; no prefix rule matches /api/v1/actors/..., so policyForRoute (policies.ts:84-91) returns defaultPolicy — 300 req/min — for a handler that calls the same emotionAvatars.startBatchGeneration() image-gen fan-out as the batch endpoint the rule was written for (wardrobe-avatars.ts:90-96). Executed evidence (bun .tmp/repro-policy.ts, real module): /emotion-avatars/single -> default DEFAULT while batch endpoints -> generation GENERATION; route liveness confirmed by bun .tmp/repro-wardrobe.ts (both POSTs answer 422 body-validation, not 404); policies.test.ts:47-52 pins batch + jobs but never /single. Reopens the image-gen spend class commit 8b4eae500 set out to close — the rule comment claims it hits exactly the generation POSTs, and it does not. Fix: add a generationPolicy suffix rule for /emotion-avatars/single (ordering is irrelevant — the longer suffix never collides) and pin it in policies.test.ts.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
