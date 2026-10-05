<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Emotion-avatar emotions array uncapped x default rate policy

**Status:** Done
**Priority:** medium
**Effort:** Medium

**Summary:**

POST /actors/:actorId/emotion-avatars (src/routes/character-emotion-avatars.ts:114) accepts an UNcapped emotions array; each entry fans out into a generation job under the default rate policy, so a single request can enqueue unbounded image-gen work. Fix: cap emotions length in the request schema and give actor image-gen routes an explicit rate policy (see companion governance ticket for the missing policies).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Review 2026-10-04

OPEN on dev - src/routes/character-emotion-avatars.ts:105-123 accepts an uncapped emotions array (enum-validity only, :114-119); no cap, no rate policy. Candidate commits 9ae3f9708 (uncapped-array fix) and 3198909a4 (rate policies for actor image-gen) are dangling - git branch --contains returns nothing - and no worktree's on-disk file caps the array.

**Resolved:** 2026-10-05 registry-driven close: git issue e1e8634 (registry tip: 2973a82e2 Konstantin Fedotov Close issue)
