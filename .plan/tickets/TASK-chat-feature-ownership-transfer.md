<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Ownership Transfer — Frontend & Backend

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-chat-product-features

## Summary

Add explicit chat-ownership transfer as a first-class action: an owner can hand the chat to another participant. The transfer must propagate permission changes, audit the handover, and re-evaluate moderator/GM roles without leaving stale grants.

## Acceptance Criteria

- [ ] Owner can transfer ownership to any current participant from a UI affordance and a backend endpoint
- [ ] Previous owner loses owner-scoped capabilities on success; new owner gains them
- [ ] Concurrent transfer attempts resolve to a single winner with audit evidence for the loser
- [ ] Moderator / GM grants are re-evaluated and reconciled post-transfer
- [ ] Transfer requires a confirmation step on the frontend and an explicit `confirm: true` on the backend
- [ ] Audit trail records previous owner, new owner, timestamp, and any revocations

## Related Tickets / Epics

- epic-chat-product-features
- TASK-validate-and-fix-fe-be-db-gaps-for-chat-vn-settings
- TASK-chat-state-contract

## Files

- `src/chat/ownership.ts`
- `src/chat/service/chats.ts`
- `src/chat/service/write.ts`
- `src/middleware/auth/`
- `src/middleware/permissions.ts`

## Open Questions

- Can ownership be transferred to a non-participant (forces an invite + transfer)?
- Is there a cooling-off window where the previous owner can revoke?

