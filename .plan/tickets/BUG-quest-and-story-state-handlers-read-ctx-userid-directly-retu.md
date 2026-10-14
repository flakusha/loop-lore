<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Quest and story-state handlers read ctx.userId directly, returning 404 instead of 401

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**

These route handlers destructure ctx.userId without going through requireUserId. An unauthenticated request therefore falls into the not-found branch and gets a 404, which tells an attacker the route exists but misreports the actual cause. Every handler in the file already declares a 401 ErrorResponse, so the contract is present but the code never emits it.

Evidence read on dev:

- src/routes/quests/progress.ts:26 and :51 — const userId = ctx.userId as string | null;
- src/routes/quests/quest.ts:25, :42, :67 — same pattern.
- src/routes/story-states/location.ts:25 and :42 — same pattern.

Contrast the correct sibling shape in src/routes/character-emotions/actor.ts:50 — const userId = requireUserId(ctx); if (typeof userId !== 'string') { return userId; }

Source: .tmp/longcat/review-consolidated.md nits 23, 24, 25.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
