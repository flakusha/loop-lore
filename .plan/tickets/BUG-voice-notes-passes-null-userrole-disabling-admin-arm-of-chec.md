<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: voice-notes passes null userRole, disabling admin arm of checkChatAccess

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

voice-notes passes a literal `null` userRole to the chat access check, disabling the admin arm.

**Files:**

- src/routes/voice-notes.ts:59

**Evidence:**

- `checkChatAccess(database, chatId, userId, null)` — the fourth argument is a literal `null` where every sibling passes `ctx.userRole` (src/routes/chat-pins.ts:88, src/routes/message-polls.ts:55 via service, src/routes/messages/ai-action.ts:83). Effect: the admin arm of `checkChatAccess` (src/chat/service/access.ts:133, `can(userRole, "admin.chat")`) is disabled, so admins get 404 for chats they neither own nor participate in. Fail-closed direction; correctness/consistency defect, not an exposure (review-surfaces.md S-9).

**Fix:**

Pass `ctx.userRole` as the fourth argument, matching every sibling call site.

**Review:** .tmp/reviews/2026-10-25/ (2026-10-25 round) — review-surfaces.md S-9.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
