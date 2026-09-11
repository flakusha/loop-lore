<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Archival / Deletion with Search Filtering & Priority

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Medium
**Epic:** epic-chat-product-features

## Summary

Provide first-class archive and hard-delete for chats, with a search filter that distinguishes archived from live chats and lets callers rank archived results below live ones. The RAG recall layer must respect archive status.

## Acceptance Criteria

- [ ] Owner / admin can archive a chat; archived chats are hidden from default listings
- [ ] Search endpoint exposes an `include_archived` flag and a `search_priority` ordering parameter
- [ ] Live chats always rank above archived chats at equal relevance
- [ ] Hard-delete cascades to messages, assets, and shared memories (with the existing shareability guard)
- [ ] RAG recall (`src/rag/search/quarantine.ts`) excludes archived chats by default
- [ ] Archived chats remain openable from a dedicated archived view

## Related Tickets / Epics

- epic-chat-product-features
- TASK-message-archive-restore-frontend
- TASK-chat-history-import-export
- TASK-chat-message-search

## Files

- `src/chat/service/visibility.ts`
- `src/chat/service/crud/`
- `src/middleware/nsfw-gate/access.ts`
- `src/rag/search/quarantine.ts`

## Open Questions

- Should archived chats contribute to NSFW moderation audits?
- What is the retention window for hard-deleted chats in audit backups?

