# TASK: Consolidate duplicate message access checks

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-logic-reconciliation

## Summary

`routes/messages.ts` duplicates access check logic from `chat/service.ts`. The service layer functions exist but are not used by the messages route.

## Current State

`chat/service.ts` provides:

- `checkChatAccess()` — verifies user owns/participates in chat
- `getMessageWithAccess()` — verifies user can access a message
- `listMessages()` — paginated message listing with variant info
- `getMessageVariants()` — message variant retrieval
- `selectVariant()` — variant selection by index

`routes/messages.ts` has its own inline equivalents:

- `assertChatAccess()` — duplicates `checkChatAccess()`
- `requireMessageAccess()` — duplicates `getMessageWithAccess()`
- Inline message listing with variant computation — duplicates `listMessages()`
- Inline variant retrieval — duplicates `getMessageVariants()`

## Fix

1. Replace `assertChatAccess()` calls with `checkChatAccess()` from `chat/service.ts`
2. Replace `requireMessageAccess()` calls with `getMessageWithAccess()` from `chat/service.ts`
3. Replace inline message listing with `listMessages()` from `chat/service.ts`
4. Replace inline variant retrieval with `getMessageVariants()` from `chat/service.ts`
5. Remove duplicate functions from `routes/messages.ts`

## Acceptance Criteria

- [ ] `routes/messages.ts` imports from `chat/service.ts`
- [ ] No duplicate access check functions in `routes/messages.ts`
- [ ] All existing tests pass: `bun test src/routes/messages.test.ts`
