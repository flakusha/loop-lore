<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Message soft delete lets any chat member hide any member's message

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

DELETE /api/messages/:id soft path (src/routes/messages/update.ts:77-83) runs after member-level checkChatAccess with no authorship scoping: any participant can set visibility=hidden_by_user on ANY member's message. The hard-delete branch directly above enforces author-or-admin - the soft path never got the guard. Fix: apply the same author-or-admin guard (or .where actor_id) to the soft branch; regression-test a non-author member soft delete. Compounds Done ticket 4217100 (hidden content stays searchable in FTS).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Review 2026-10-04

OPEN on dev - the author-or-admin guard exists only in the hardDelete branch (src/routes/messages/update.ts:56-75); the soft branch (update.ts:77-81) sets visibility="hidden_by_user" after just checkChatAccess (:53) with no actor scoping. No worktree touches update.ts.
