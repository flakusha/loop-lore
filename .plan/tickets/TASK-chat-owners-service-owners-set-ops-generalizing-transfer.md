<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Chat owners service: owners-set ops generalizing transfer

**Status:** Done
**Status Note:** Done 2026-10-30 in worktree tree/chat-multi-ownership: owners.ts/owners-core.ts/owners-types.ts/owners-events.ts (isChatOwner + addChatOwner + removeChatOwner + MAX_CHAT_OWNERS=3), transfer tx maintains the owners set, reconcileModeratorGrants keeps GM seats for every owners-set member (fallback: newOwnerId for unmaterialized chats). Existing ownership/route tests unchanged and green (compat proof); suites 74 pass / 0 fail (+1 pre-existing skip); gates typecheck-backend/eslint/size-strict/wiring PASS. Deviation flagged: `chats.created_by` flip RETAINED in transferOwnership (existing tests pin it); `created_by` stays "current owner of record" rather than frozen creator — revisit in check-sweep ticket.
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

- [x] Implementation complete — `src/chat/service/owners.ts` (addChatOwner/removeChatOwner, owner-or-admin authority, actor→user resolution, auto-invite role owner, duplicate + MAX_CHAT_OWNERS=3 refusal, last-owner guard, conditional in-tx DELETE), `owners-core.ts` (isChatOwner transitional predicate row-OR-created_by, syncOwnersOnTransfer), `owners-types.ts`, `owners-events.ts` (chat_owner_added/removed audit rows with owners-array meta; notification fan-out to affected + all remaining owners). transferOwnership tx calls syncOwnersOnTransfer (HTTP contract untouched). reconcileModeratorGrants keeps GM for every owners-set member.
- [x] Tests passing — ownership.test.ts extended (+12 cases: cap, duplicate, last-owner, resign, authority/admin, auto-invite, concurrent last-two + same-target removals with exactly-one-winner, audit rows, notification fan-out, transfer owners-set maintenance, isChatOwner fallback); access.test.ts +multi-owner reconcile case; routes/chats/ownership.test.ts UNCHANGED and green (compat proof). 74 pass / 0 fail / 1 pre-existing skip across ownership+access+route suites.
- [x] Documentation updated — module docstrings; ticket Status Note records the created_by-flip deviation for the check-sweep ticket.
