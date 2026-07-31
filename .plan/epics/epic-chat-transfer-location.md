# EPIC: Chat/Group Chat Transfer & Location Change Mechanics

**Status:** 🟡 Partial — foundation exists (search, join, transfer endpoints)
**Priority:** P2-B
**Effort:** High
**Type:** Feature Epic

## Summary

Chat location change, party travel, and multi-location chat spanning. Covers:

- In-chat location change (same chat, new location)
- Create new chat at destination
- Join existing chat at destination
- Party join/leave with VN-driven transitions
- Chat sectioning for multi-location journeys

## What Exists Now

| Component                          | Status                  | Location                                               |
| ---------------------------------- | ----------------------- | ------------------------------------------------------ |
| `chats.current_location_id`        | ✅ DB column            | `schema-core.ts`                                       |
| `chats.parent_chat_id`             | ✅ DB column            | `schema-core.ts`                                       |
| `PUT /api/chats/:id/location`      | ✅ Simple update        | `routes/chats.ts`                                      |
| `POST /api/chats/:chatId/transfer` | ✅ Transfer to location | `routes/chat-search.ts`                                |
| `POST /api/chats/:chatId/join`     | ✅ Join existing chat   | `routes/chat-search.ts`                                |
| `GET /api/chats/joinable`          | ✅ Discover chats       | `routes/chat-search.ts`                                |
| `GET /api/chats/search`            | ✅ Search chats         | `routes/chat-search.ts`                                |
| Transition detection               | ✅ Regex-based          | `chat/transitions.ts`                                  |
| `ChatTransition.location_change`   | ✅ Type exists          | `chat/types.ts`                                        |
| Chat sections (multi-location)     | ❌ No DB table          | Design only (`TASK-chat-sectioning-multi-location.md`) |
| Party join/leave                   | ❌ No logic             | —                                                      |
| VN-driven location transitions     | ❌ No integration       | —                                                      |

## Design

### Location Change — Three Modes

When a character moves from Location A to Location B, the system offers three options:

| Mode              | Behavior                                                                                                  | Use Case                      |
| ----------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **In-Chat**       | Update `current_location_id` on existing chat. Messages continue in same thread. Location marker changes. | Quick move, story continuity  |
| **New Chat**      | Create new chat at destination with same participants. Parent chat links via `parent_chat_id`.            | Fresh context, long stay      |
| **Join Existing** | Add user to an existing chat at the destination.                                                          | Multiplayer, public locations |

#### In-Chat Location Change

```
User narrates: "I walk to the tavern"
  ↓
Transition detection (regex) → type: "location_change"
  ↓
PUT /api/chats/:id/location { locationId: "tavern-123" }
  ↓
DB: chats.current_location_id = "tavern-123"
  ↓
ChatTransition event emitted with narration
  ↓
UI: location marker updates, background crossfade, ambient sound change
```

#### Create New Chat at Destination

```
User selects "Create new chat at location"
  ↓
POST /api/chats with:
  - name: "Tavern"
  - worldId: (from current chat)
  - currentLocationId: "tavern-123"
  - participantIds: [all current participants]
  - parentChatId: (current chat id)
  ↓
DB: new chat with parent_chat_id linking back
  ↓
Participants moved (removed from old, added to new)
  ↓
Transition narration posted in both chats
```

#### Join Existing Chat

```
User selects "Join chat at location"
  ↓
GET /api/chats/joinable?location=tavern-123
  ↓
User picks a chat
  ↓
POST /api/chats/:chatId/join
  ↓
User added as participant
  ↓
Chat loads with full history from join point
```

### Party Travel Mechanics

A "party" is a set of characters traveling together. Party mechanics are
implicit — defined by which characters share a chat in group/story mode.

#### Party Join

When a new character joins a party chat:

1. `POST /api/chats/:chatId/participants` — add character actor
2. VN transition: entrance narration ("A figure approaches...")
3. Character state loaded (stats, inventory, conditions from DB)
4. Welcome message generated (if character has one)
5. Chat participant record created with talkativity/initiative

#### Party Leave

When a character leaves a party:

1. `DELETE /api/chats/:chatId/participants/:actorId` — remove character
2. VN transition: departure narration ("X heads toward the exit...")
3. Character state snapshot saved (for rejoin continuity)
4. Chat continues with remaining participants

#### Party Split (Branch Chat)

When the party decides to split:

1. Detect split in user narration (regex or explicit command)
2. For each sub-group:
   - Create new chat with `parent_chat_id` = current chat
   - Add sub-group participants
   - Copy relevant context (recent messages, active quests)
   - Post split narration in both parent and child chats
3. Each sub-group chat operates independently
4. Location markers diverge

#### Party Reunite (Merge Chat)

When split parties reunite:

1. Detect reunion (user narrates or explicit command)
2. Pick one chat as the "primary" (most recent activity)
3. Merge messages from secondary into primary (chronological)
4. Remove duplicate participants
5. Post reunion narration
6. Optionally archive the secondary chat

### Chat Sectioning (Multi-Location Journey)

For long journeys spanning multiple locations, a single chat can have
ordered sections — each tied to a location. See `TASK-chat-sectioning-multi-location.md`
for the full design.

Key schema addition:

```sql
CREATE TABLE chat_sections (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  world_id TEXT NOT NULL REFERENCES worlds(id),
  section_order INTEGER NOT NULL,
  title TEXT,
  transition_type TEXT CHECK (transition_type IN ('walk','teleport','cutscene','combat','choice','narrative')),
  started_at TEXT NOT NULL,
  ended_at TEXT
);
```

Each message gets a `section_id` column linking it to its location section.

### VN Integration

VN mode provides visual transitions for location changes:

| Event                  | VN Effect                            |
| ---------------------- | ------------------------------------ |
| Location change        | Scene transition (fade/cut/dissolve) |
| Party join             | Character entrance animation         |
| Party leave            | Character exit animation             |
| Party split            | Screen split / parallel scenes       |
| Party reunite          | Scene merge                          |
| Travel (long distance) | Travel montage with progress bar     |

VN choice cards can drive location decisions:

```
[Scene: Crossroads]
The path splits ahead.

[Card: Left — "Head toward the Dark Forest"]
[Card: Right — "Take the mountain pass"]
[Card: Back — "Return to the village"]
```

Selecting a card triggers the corresponding location change.

## Scope

### Phase 1: In-Chat Location Change + Sectioning

- [ ] Create `chat_sections` table (migration)
- [ ] Add `section_id` to messages table
- [ ] Wire location change to section creation
- [ ] Add section-aware message queries
- [ ] VN scene transition on location change
- [ ] Background/sound sync per section

### Phase 2: Party Join/Leave

- [ ] Extend participant API with VN narration
- [ ] Character state snapshot on leave
- [ ] Welcome message generation for joins
- [ ] VN entrance/exit animations
- [ ] Talkativity/initiative seeding for new members

### Phase 3: Party Split/Merge

- [ ] Split detection (regex + explicit command)
- [ ] Branch chat creation with context copy
- [ ] Merge message logic with dedup
- [ ] VN split/reunite visual effects
- [ ] Parent-child chat linking

### Phase 4: New Chat + Join Existing

- [ ] "Create chat at location" flow
- [ ] "Join existing chat" flow with context preview
- [ ] Transition narration bridging old → new chat
- [ ] Parent chat linking for journey tracking

## Tasks

- `TASK-chat-sectioning-multi-location.md` — sectioning design + impl
- `TASK-chat-transfer-location.md` — location transfer API
- `TASK-travel-party-migration.md` — party split/merge
- `TASK-travel-interface.md` — frontend travel UI
- `TASK-chat-backgrounds-location-sync.md` — background per location

## Files

### Existing (to modify)

- `src/routes/chats.ts` — add section-aware queries
- `src/routes/chat-search.ts` — extend transfer endpoint
- `src/chat/service.ts` — add section CRUD, party join/leave
- `src/chat/transitions.ts` — wire section creation to transitions
- `src/chat/types.ts` — add section types
- `src/db/schema-core.ts` — add chat_sections, section_id on messages
- `src/frontend/vn/scene-renderer.ts` — location transition effects
- `src/frontend/vn/choice-cards.ts` — location choice cards

### New (to create)

- `src/db/migrations/031_chat_sections.ts` — chat_sections table
- `src/routes/chat-sections.ts` — section CRUD endpoints
- `src/frontend/alpine/travel-panel.ts` — travel UI
- `src/frontend/alpine/party-roster.ts` — party join/leave UI

## Integration Points

### Systems This Epic Depends On

| System            | What It Provides                  | How Used                         |
| ----------------- | --------------------------------- | -------------------------------- |
| Visual Novel Mode | Scene transitions, choice cards   | VN-driven location transitions   |
| World & Locations | Location definitions, connections | Travel routes, location metadata |
| Chat Lifecycle    | Context window, transitions       | Section-aware context management |
| Multi-Session     | Session state persistence         | Party state across sessions      |

### Systems That Depend On This Epic

| System        | What It Consumes    | How Used                                  |
| ------------- | ------------------- | ----------------------------------------- |
| RPG Mechanics | Character location  | Dice rolls per location, encounter tables |
| Battle        | Party composition   | Combat encounters at locations            |
| Exploration   | Location discovery  | Unlocking new travel routes               |
| Weather       | Location conditions | Weather effects per section               |
| Random Events | Location triggers   | Events at specific locations              |

### Cross-System Events

| Event                   | Direction | Purpose                            |
| ----------------------- | --------- | ---------------------------------- |
| `chat.location_changed` | emits     | Notify weather, encounters, events |
| `chat.section_created`  | emits     | New location section in journey    |
| `chat.party_joined`     | emits     | Character entered chat             |
| `chat.party_left`       | emits     | Character left chat                |
| `chat.party_split`      | emits     | Party branched                     |
| `chat.party_reunited`   | emits     | Split parties merged               |
