<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Chat history truncates to oldest messages, drops recent turns

**Status:** [OK] Done
**Priority:** high
**Effort:** Medium

## Summary

chat-history.ts orders created_at ASC + limit(tokenBudget/4); long chats lose newest turns. chatHistory is PRIORITY 0 so never dropped by dropOverBudgetSections. Fix: recent-window (desc+limit, reverse) + make history budget-aware.

## Acceptance Criteria

- [x] Implementation complete — `chatHistorySection` now reads `created_at DESC + id DESC LIMIT maxMessages` and reverses in-section so long chats keep their newest turns.
- [x] Tests passing — added regression test in `src/assistant/prompt/sections/chat-history.test.ts` ("long chats keep the most recent turns"); existing identity/gzip test still passes with explicit timestamps; all 9 prompt-assembler tests still pass.
- [x] Documentation updated — JSDoc on the section now states the recent-window strategy and why reversal is required.
