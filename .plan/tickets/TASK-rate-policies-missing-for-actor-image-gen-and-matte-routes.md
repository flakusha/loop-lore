<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Rate policies missing for actor image-gen and matte routes

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

src/middleware/api-governance/rate-limiting/policies.ts:55-65 defines no rate policy for the actor emotion-avatar generation routes (POST /actors/:actorId/emotion-avatars) or the matting routes - both fan out expensive image generation under default/no policy. Fix: add explicit policies (per-user, concurrent-job aware) consistent with the existing image-gen policies; relates to the uncapped emotions-array ticket.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Review 2026-10-04

OPEN on dev - src/api-governance/rate-limiting/policies.ts:55-65 (the ticket's src/middleware path has moved to src/api-governance) routePolicies covers only /auth, /generation, /chats, /messages - no emotion-avatar or matting prefixes; only one generationPolicy exists. No worktree policies.ts mentions emotion-avatars/matting.
