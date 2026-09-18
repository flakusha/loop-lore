<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat history can inject System-role messages (prompt injection)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/assistant/prompt/sections/chat-history.ts:62-86 emits history rows with original role incl MessageRole.System as role system. Any user-influenced System message = direct instruction injection. Fix: strip/forbid System role in history; demote to user; wrap. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
