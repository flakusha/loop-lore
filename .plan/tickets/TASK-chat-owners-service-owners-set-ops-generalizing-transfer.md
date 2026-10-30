<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Chat owners service: owners-set ops generalizing transfer

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-chat-multi-ownership
**Tags:** chat, ownership, audit
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Owners-set service in src/chat/service: isChatOwner(db, chatId, userId) predicate over chat_owners (created_by no longer confers authority), addChatOwner and removeChatOwner (resign = remove self), and transferOwnership re-anchored as add-new + remove-self inside one transaction so its HTTP contract is unchanged. Authority: any current owner or admin (can admin.chat). Cap MAX_CHAT_OWNERS = 3; refuse duplicates; never-zero-owners guard via conditional per-row DELETE plus owner count inside the same tx — concurrent last-owner removals yield exactly one winner, the loser gets CONCURRENT_MODIFICATION through the existing interpretTransferError channel. reconcileModeratorGrants keeps GM seats for every current owner instead of one id. Audit: log_entries event types chat_owner_added / chat_owner_removed with owners-array meta; chat_ownership_transferred retained for the compat path. Notifications fan out to all remaining owners plus the affected user (ownership-events pattern). AC: unit tests cover add/remove/resign/last-owner/cap/duplicate/concurrent-removal matrix; existing ownership.test.ts stays green with owner-set assertions added; auto-invite participant write still feeds chat key distribution.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
