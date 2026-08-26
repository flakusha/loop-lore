<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-recon-dedup: Backend reconciliation — Phase 4 de-duplication (+ Phase 5 backlog)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** TASK
**Tags:** backend, dedup, refactor
**Epic:** epic-logic-reconciliation
**Parent:** TASK-reconciliation-plan (umbrella)

## Summary

Consolidate the duplicated access-check, message-listing and context-window logic in `routes/messages.ts` / `routes/chat-context.ts` onto `chat/service.ts`; carry the low-priority Phase 5 items as an explicit backlog.

## Context

Duplicate logic found by the audit:

- `routes/messages.ts` has its own `assertChatAccess()` and `requireMessageAccess()` — duplicates `checkChatAccess()` and `getMessageWithAccess()` from `chat/service.ts`
- `routes/messages.ts` has its own message listing + variant logic — duplicates `listMessages()` and `getMessageVariants()` from `chat/service.ts`
- `routes/chat-context.ts` has its own context window logic — duplicates `getChatContext()` from `chat/service.ts`

## Tasks

### 4.1 Consolidate message access checks

- Remove `assertChatAccess` and `requireMessageAccess` from `routes/messages.ts`
- Use `checkChatAccess` and `getMessageWithAccess` from `chat/service.ts`

### 4.2 Consolidate message listing/variants

- Use `listMessages` and `getMessageVariants` from `chat/service.ts` in `routes/messages.ts`

### 4.3 Consolidate context window logic

- Use `getChatContext` from `chat/service.ts` in `routes/chat-context.ts`

### Phase 5 backlog (low priority — not scheduled)

- E2E tests (not passing, future patches needed)
- Task and epic closure (will be reconciled as stabilization is done)
- ESLint issues not impacting logic
- Frontend wirings (out of scope)

## Dependencies

- Parent hub: `TASK-reconciliation-plan.md`
- Siblings: coordinate with TASK-recon-critical-fixes task 1.3 (same consolidation surface on `chat/service.ts`) — land 1.3 first or jointly to avoid merge churn.
