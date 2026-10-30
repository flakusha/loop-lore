<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Chat owners check sweep across single-owner call sites

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-chat-multi-ownership
**Tags:** chat, ownership, access-control
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Swap every created_by === userId single-owner check to the isChatOwner predicate, mechanically, no access-layer restructure: checkChatAccess (src/chat/service/access.ts:133), checkChatSettingsAccess (access.ts:210), transferOwnership authority (ownership.ts:201), read.ts:51 hidden-message read, batch.ts:24/56/104 owned-chat scoping (becomes owners-set membership), polls.ts:247 isChatOwner, music-links.ts:224, split.ts:97 and 191-196 party split/reunion, transitions.ts:55 ownership guard. Update docs/spec/chat-privacy.md 5.1 to the owners-set rule (creator retained as created_by). AC: each swapped call site gains a co-owner positive test (a second chat_owners row passes where the old created_by check denied); spec section updated; a repo grep for created_by === in src/chat leaves only creator-semantics uses.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
