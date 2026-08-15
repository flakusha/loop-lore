# TASK: Chat/Locations/Worlds: Finalize Current Implementation

**Status:** ✅ Done
**Priority:** high
**Effort:** Medium

## Summary

Finalize chat, locations, and worlds data model + API. Wire up location-aware chat creation, world-scoped characters, chat-to-location mapping. Close gaps in current src/ implementation. High impact.

## Implementation Evidence

- `src/chat/service/crud/create.ts` — `current_location_id` in chat creation
- `src/chat/service/location-events.ts` — `recordLocationChange`, `getLocationHistory` (migration 040)
- `src/chat/service/carry-location.ts` — location context carry during migration
- `src/chat/service/carry-world-state.ts` — world/npc/location state carry
- `src/routes/chats/extras.ts` — `recordLocationChange` wired in route
- `src/routes/messages/handle-scene-transitions.ts` — location change on scene transition
- `src/routes/chat-sections/` — full CRUD for location-tagged chat sections
- `src/routes/chat-backgrounds/` — background assignment with location sync
- `src/routes/chat-search/` — location-aware chat search and join

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated
