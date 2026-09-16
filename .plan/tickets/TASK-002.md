<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-002: Chat room search and join

**Status:** [OK] Done
**Priority**: medium
**Labels**:
**Assignee**:
**Epic**:
**Related**:

Git issue: `20c7472`

## Resolution

Implemented. Evidence: `src/routes/chat-search/search.ts` (`GET /api/chats/search`),
`src/routes/chat-search/joinable.ts` (`GET /api/chats/joinable`),
`src/routes/chat-search/join.ts` (`POST /api/chats/:id/join`), covered by
`src/routes/chat-search/index.test.ts`.
