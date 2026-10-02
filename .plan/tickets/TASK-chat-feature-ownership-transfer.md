<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Ownership Transfer — Frontend & Backend

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
 **Status Note:** All 6 ACs green — final AC (moderator/GM re-eval) verified against src + scoped tests 2026-10-01.
 **Status:** Done (2026-10-01)
**Priority:** High
**Effort:** Medium
**Epic:** epic-chat-product-features

## Summary

Add explicit chat-ownership transfer as a first-class action: an owner can hand the chat to another participant. The transfer must propagate permission changes, audit the handover, and re-evaluate moderator/GM roles without leaving stale grants.

## Acceptance Criteria

- [x] Owner can transfer ownership to any current participant from a UI affordance and a backend endpoint
- [x] Previous owner loses owner-scoped capabilities on success; new owner gains them
- [x] Concurrent transfer attempts resolve to a single winner with audit evidence for the loser (proven by service `concurrent transfers` test: exactly one wins, loser leaves no partial writes, single audit row; loser evidence is an app-log warn without its own assertion)
- [x] Moderator / GM grants are re-evaluated and reconciled post-transfer (proven by `reconcileModeratorGrants` wired at `src/chat/service/ownership.ts:115` best-effort after the flip; behavior tests demote non-owner GMs and keep the new owner's GM seat in `access.test.ts`; `ownership.test.ts` pins invoked-exactly-once with correct ids + failure logged without rollback)
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
- 2026-10-01 re-verify (evidence-first close): all 6 ACs ticked. Scoped green: `bun test --parallel=4 --isolate src/chat/service/access.test.ts src/chat/service/ownership.test.ts src/routes/chats/ownership.test.ts src/frontend/alpine/chat-settings/ownership-actions.test.ts` → 65 pass / 1 skip / 0 fail. The moderator/GM AC is satisfied by `reconcileModeratorGrants` (wired post-flip at `src/chat/service/ownership.ts:115`; behavior tests in `access.test.ts`, wiring/tolerance tests in `ownership.test.ts`) — no new test needed, coverage was already real.

## Open Questions

- Resolved: yes — non-participants are auto-invited with `role_in_chat = owner` before the flip.
- Is there a cooling-off window where the previous owner can revoke?

**Resolved:** 2026-10-02 registry-driven close: git issue 0fb84d5 (registry tip: d93b51379 gate Auto-closed: appended .md marker marks TASK-CHAT-FEATURE-OWNERSHIP-TRANSFER done)
