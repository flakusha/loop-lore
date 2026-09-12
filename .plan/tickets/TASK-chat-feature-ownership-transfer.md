<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Ownership Transfer — Frontend & Backend

**Status:** 🚧 In Progress (5/6 ACs proven by tests; moderator/GM reconciliation has no implementation — the spec `gm` role has not landed)
**Priority:** High
**Effort:** Medium
**Epic:** epic-chat-product-features

## Summary

Add explicit chat-ownership transfer as a first-class action: an owner can hand the chat to another participant. The transfer must propagate permission changes, audit the handover, and re-evaluate moderator/GM roles without leaving stale grants.

## Acceptance Criteria

- [x] Owner can transfer ownership to any current participant from a UI affordance and a backend endpoint
- [x] Previous owner loses owner-scoped capabilities on success; new owner gains them
- [x] Concurrent transfer attempts resolve to a single winner with audit evidence for the loser (proven by service `concurrent transfers` test: exactly one wins, loser leaves no partial writes, single audit row; loser evidence is an app-log warn without its own assertion)
- [ ] Moderator / GM grants are re-evaluated and reconciled post-transfer (no moderator/GM logic in service; no scoped test covers it)
- [x] Transfer requires a confirmation step on the frontend and an explicit `confirm: true` on the backend
- [x] Audit trail records previous owner, new owner, timestamp, and any revocations (proven by service audit-row test: `chat_ownership_transferred` row with previous/new owner + reason, timestamp-ordered)

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
- `bun test src/chat/service/ownership.test.ts`: 10 pass / 0 fail (38 expects) — covers audit row + concurrent single-winner
- 36 tests total. Only the moderator/GM AC remains unchecked: no such logic exists (spec `gm` role unlanded per `src/chat/service/access.ts`).

## Open Questions

- Resolved: yes — non-participants are auto-invited with `role_in_chat = owner` before the flip.
- Is there a cooling-off window where the previous owner can revoke?

