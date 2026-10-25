<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Message soft delete lets any chat member hide any member's message

**Status:** Done
**Status Note:** stale-resolved (verified 2026-10-25) — DELETE /api/messages/:id (src/routes/messages/update.ts:57-67) now enforces author-or-admin (`message.actor_id !== actorId && !can(ctx.userRole, "admin.chat")` → 403) BEFORE both the hard-delete and soft `hidden_by_user` branches, so a non-author member can no longer hide another member's message.
**Priority:** high
**Effort:** Medium
**Epic:** epic-messages

**Summary:**

DELETE /api/messages/:id soft path (src/routes/messages/update.ts:77-83) runs after member-level checkChatAccess with no authorship scoping: any participant can set visibility=hidden_by_user on ANY member's message. The hard-delete branch directly above enforces author-or-admin - the soft path never got the guard. Fix: apply the same author-or-admin guard (or .where actor_id) to the soft branch; regression-test a non-author member soft delete. Compounds Done ticket 4217100 (hidden content stays searchable in FTS).

**Context:**

Closure rationale (verified 2026-10-25 against the current implementation): DELETE /api/messages/:id (src/routes/messages/update.ts:57-67) now enforces author-or-admin (`message.actor_id !== actorId && !can(ctx.userRole, "admin.chat")` → 403) BEFORE both the hard-delete and soft `hidden_by_user` branches, so a non-author member can no longer hide another member's message.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Review 2026-10-04

OPEN on dev - the author-or-admin guard exists only in the hardDelete branch (src/routes/messages/update.ts:56-75); the soft branch (update.ts:77-81) sets visibility="hidden_by_user" after just checkChatAccess (:53) with no actor scoping. No worktree touches update.ts.

**Resolved:** 2026-10-25 registry-driven close: git issue d13cc4b (registry tip: 1d6cc8219 Konstantin Fedotov Close issue)
