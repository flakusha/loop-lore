# EPIC: Chat/Group Chat Transfer & Location Change Mechanics

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Type:** Feature Epic

## Summary

Chat/group chat transfer and location change mechanics improvement. Shared chat for multiple location journey, branching off parties to other locations.

## Scope

- Chat transfer between locations
- Group chat location branching
- Shared chat for multi-location journeys
- Party branching mechanics
- Location-aware chat state

## Design

### Transfer Mechanics

| Scenario             | Behavior                       |
| -------------------- | ------------------------------ |
| Single user moves    | Chat transfers to new location |
| Group moves together | Shared chat continues          |
| Party splits         | Branch chat per location       |
| Party reunites       | Merge chats                    |

### Shared Chat Model

```
Journey Chat
├── Location A (messages)
├── Location B (messages)
├── Location C (messages)
└── Back to Location A (messages)
```

## Tasks

- [ ] Chat location transfer API
- [ ] Group chat branching logic
- [ ] Shared chat model
- [ ] Party split/merge mechanics
- [ ] Location-aware message queries
- [ ] Transfer UI components

## Files

- `src/routes/chats.ts` — transfer endpoints
- `src/group-chat/` — branching logic
- `src/db/schema-chats.ts` — location-aware schema
- `src/frontend/alpine/chat.ts` — transfer UI
