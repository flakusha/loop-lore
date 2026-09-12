<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Ownership Transfer — Frontend & Backend

**Status:** 🚧 In Progress (3/6 ACs proven by scoped tests; concurrency/audit/moderator paths implemented but untested)
**Priority:** High
**Effort:** Medium
**Epic:** epic-chat-product-features

## Summary

Add explicit chat-ownership transfer as a first-class action: an owner can hand the chat to another participant. The transfer must propagate permission changes, audit the handover, and re-evaluate moderator/GM roles without leaving stale grants.

## Acceptance Criteria

- [x] Owner can transfer ownership to any current participant from a UI affordance and a backend endpoint
- [x] Previous owner loses owner-scoped capabilities on success; new owner gains them
- [ ] Concurrent transfer attempts resolve to a single winner with audit evidence for the loser (implemented in service via conditional `created_by` flip + loser audit warn; no scoped test exercises it)
- [ ] Moderator / GM grants are re-evaluated and reconciled post-transfer (no moderator/GM logic in service; no scoped test covers it)
- [x] Transfer requires a confirmation step on the frontend and an explicit `confirm: true` on the backend
- [ ] Audit trail records previous owner, new owner, timestamp, and any revocations (service writes audit meta; no scoped test asserts the audit record — only the response envelope)

## Related Tickets / Epics

- epic-chat-product-features
- TASK-validate-and-fix-fe-be-db-gaps-for-chat-vn-settings
- TASK-chat-state-contract

## Files

- `src/chat/service/ownership.ts` — transfer service (conditional `created_by` flip, audit, notifications)
- `src/routes/chats/ownership.ts` — `POST /api/chats/:id/transfer-ownership` (`confirm: true` gate)
- `src/frontend/alpine/chat-settings/ownership.ts` — modal actions, sends `confirm: true`
- `src/components/chat/chat-settings-modal.html` — transfer trigger + confirmation modal

## Verification (2026-09-12, post-rebase onto dev)

- `bun test src/routes/chats/ownership.test.ts`: 12 pass / 0 fail (32 expects)
- `bun test src/frontend/alpine/chat-settings/ownership-actions.test.ts`: 14 pass / 0 fail (31 expects)
- Only the 3 still-checked ACs are proven by these 26 tests; the 3 unchecked ACs need scoped tests before they can be re-checked.

## Open Questions

- Resolved: yes — non-participants are auto-invited with `role_in_chat = owner` before the flip.
- Is there a cooling-off window where the previous owner can revoke?

