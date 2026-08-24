# BUG: Chat history truncates to oldest messages, drops recent turns

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

chat-history.ts orders created_at ASC + limit(tokenBudget/4); long chats lose newest turns. chatHistory is PRIORITY 0 so never dropped by dropOverBudgetSections. Fix: recent-window (desc+limit, reverse) + make history budget-aware.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
