<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Chat Transfer & Location Change

**Status:** ✅ Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-chat-transfer-location

## Summary

Chat transfer and location change: move chats between locations, location-aware chat discovery, chat-to-location mapping. From Epic 41.

## Implementation Evidence

- Migration 040: `chat_sections` table for location-tagged journey sections
- `src/chat/service/location-events.ts` — `recordLocationChange`, `getLocationHistory`
- `src/chat/service/carry-location.ts` — carry location context during chat migration
- `src/routes/chats/extras.ts` — location change endpoint wired
- `src/routes/messages/handle-scene-transitions.ts` — auto-record location on scene transition
- `src/routes/chat-sections/` — section CRUD (create, list, assign, remove, reorder, update)
- `src/routes/chat-search/transfer.ts` — chat transfer route

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated
