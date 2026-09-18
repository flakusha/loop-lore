<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Stale SSE stream writes render into wrong chat

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Resolved (commit 04411f8 — SSE stream scoped to chat)
**Priority:** medium
**Effort:** Medium

## Summary

src/frontend/alpine/chat-generations.ts:26-35: stream-update/tool_call handlers close over chatId but write shared `_streamContent`/`#stream-container` with no activeChat===chatId check. Switching chats mid-generation renders old chat's stream into new chat view; also sets activeAttemptId=chatId unconditionally. Fix: guard handlers on current activeChat.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
