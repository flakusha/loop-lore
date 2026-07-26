# TASK: Travel Mode — Party Migration Between Chats

**Priority:** Medium
**Status:** ⬜ Not Started
**Epic:** epic-chat-transfer-location
**Tags:** travel, party, migration, chat, location, multi-location

## Description

Add party migration between chats for travel mode. When characters decide to move from one location to another, the entire party (including GM) can migrate to a new chat that represents the destination location. Supports chat spanning multiple locations and party splitting/merging.

## How It Extends Existing Work

Builds on the Chat Transfer & Location Change epic's chat transfer mechanics and shared chat model. Adds party migration and multi-location chat spanning on top of the existing transfer infrastructure.

## Acceptance Criteria

- [ ] Party migration — move entire party (all characters + GM) to a new chat
- [ ] Multi-location chat — single chat spans multiple locations with location markers
- [ ] Location marker in chat — indicate current location in chat header
- [ ] Party splitting — split party into separate chats at different locations
- [ ] Party merging — merge chats when parties reunite at the same location
- [ ] Travel time simulation (optional: time passes during travel)
- [ ] Travel event generation (random encounters, weather changes during travel)
- [ ] Character state persistence across chat migration (inventory, HP, conditions)
- [ ] GM state persistence (GM notes, campaign state) across migration
- [ ] `POST /api/chat/:id/travel/migrate` — migrate party to new chat
- [ ] `POST /api/chat/:id/travel/split` — split party into separate chats
- [ ] `POST /api/chat/:id/travel/merge` — merge chats when parties reunite
- [ ] Frontend travel mode UI with location map and party roster
- [ ] Frontend location marker in chat header
- [ ] Config: enable/disable travel mode per world

## Technical Notes

- Party migration uses existing character and chat migration infrastructure
- Multi-location chat stores location history in chat metadata
- Character state persistence uses the existing persistence layer (Epic: World Persistence & Sync)
- Travel events use the existing random event generator (TASK-local-random-event-generator)
- Integrates with World & Locations epic for location definitions
- Integrates with World Event System (TASK-world-event-system.md) for travel-triggered events
