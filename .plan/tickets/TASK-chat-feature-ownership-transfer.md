<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Ownership Transfer — Frontend & Backend

**Status:** ✅ Done
**Priority:** High
**Effort:** Medium
**Epic:** epic-chat-product-features

## Summary

Add explicit chat-ownership transfer as a first-class action: an owner can hand the chat to another participant. The transfer must propagate permission changes, audit the handover, and re-evaluate moderator/GM roles without leaving stale grants.

## Acceptance Criteria

- [x] Owner can transfer ownership to any current participant from a UI affordance and a backend endpoint
- [x] Previous owner loses owner-scoped capabilities on success; new owner gains them
- [x] Concurrent transfer attempts resolve to a single winner with audit evidence for the loser
- [x] Moderator / GM grants are re-evaluated and reconciled post-transfer
- [x] Transfer requires a confirmation step on the frontend and an explicit `confirm: true` on the backend
- [x] Audit trail records previous owner, new owner, timestamp, and any revocations

## Related Tickets / Epics

- epic-chat-product-features
- TASK-validate-and-fix-fe-be-db-gaps-for-chat-vn-settings
- TASK-chat-state-contract

## Files

- `src/chat/service/ownership.ts` — transfer service (conditional `created_by` flip, audit, notifications)
- `src/routes/chats/ownership.ts` — `POST /api/chats/:id/transfer-ownership` (`confirm: true` gate)
- `src/frontend/alpine/chat-settings/ownership.ts` — modal actions, sends `confirm: true`
- `src/components/chat/chat-settings-modal.html` — transfer trigger + confirmation modal

## Open Questions

- Resolved: yes — non-participants are auto-invited with `role_in_chat = owner` before the flip.
- Is there a cooling-off window where the previous owner can revoke?

