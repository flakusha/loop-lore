<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Wire NSFW 5-tier rating into enforcement (epic open item B4)

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-nsfw-capabilities

**Summary:**

Found while reconciling `.plan/epics/epic-nsfw-capabilities.md`. Core gating, consent, overrides, and the age gate all landed in commit `49731047`.

The epic's own open item B4 is unmet: the 5-tier rating model exists in `src/schemas/nsfw-rating.ts` with `isRatingAllowed` in `src/hooks/nsfw-rating.ts`, but the rating is not wired into the enforcement path. Content is gated, but the tier a piece of content carries does not drive the decision.

Implementation: resolve a content rating at enforcement time and pass it to `isRatingAllowed` alongside the actor preference override (`src/middleware/nsfw-gate/consent.ts`), so a high-tier asset is refused even when the general NSFW gate is satisfied. Add a test per tier boundary.

This is a safety control, not a feature. Do not ship it without the boundary tests.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
