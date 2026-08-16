<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Travel Mode — Party Migration Between Chats

**Status:** ⬜ Not Started
**Priority:** P2-B
**Effort:** High
**Epic:** epic-chat-transfer-location
**Tags:** travel, party, migration, chat, location, multi-location

## Summary

Party join/leave mechanics with VN-driven transitions. When characters decide
to move from one location to another, the party (including GM) can:

- Join an existing chat at the destination
- Create a new chat at the destination
- Split into sub-parties at different locations
- Reunite split parties

## What Exists

| Component                                     | Status | Notes                                 |
| --------------------------------------------- | ------ | ------------------------------------- |
| `POST /api/chats/:id/join`                    | ✅     | Add user as participant               |
| `DELETE /api/chats/:id/participants/:actorId` | ✅     | Remove participant                    |
| `POST /api/chats/:id/transfer`                | ✅     | Move chat to new location             |
| VN scene renderer                             | ✅     | Has transition effects                |
| VN choice cards                               | ✅     | Can drive location decisions          |
| Party concept                                 | ❌     | No DB table, implicit via shared chat |
| VN join/leave narration                       | ❌     | No wiring                             |
| Party split/merge                             | ❌     | No logic                              |

## Design

### Party = Implicit via Shared Chat

A "party" is not a separate entity — it's the set of characters sharing a
chat in group/story mode. This is already the case:

```
Chat "Dungeon Crawl" (group, story mode)
├── Participant: Alice (user)
├── Participant: Bob (AI character)
├── Participant: GM (AI character)
└── All three are the "party"
```

No `parties` table needed. Party mechanics operate on `chat_participants`.

### Party Join Flow

When a new character joins the party:

1. **API**: `POST /api/chats/:id/participants` with `actorId`
2. **VN Transition**: Entrance narration
   - System generates: "A figure approaches from the shadows..."
   - Or character's `welcome_message` if set
3. **State Load**: Character stats/inventory loaded from DB
4. **Participant Record**: Created with default talkativity (5) and initiative (0)
5. **Event**: `chat.party_joined` emitted

```typescript
// New endpoint or extension:
POST /api/chats/:id/participants
  body: { actorId: string, role?: "member" | "guest" }
  response: {
    ok: true,
    participant: { actorId, role, talkativity },
    entranceNarration?: string  // VN transition text
  }
```

### Party Leave Flow

When a character leaves the party:

1. **API**: `DELETE /api/chats/:id/participants/:actorId`
2. **VN Transition**: Departure narration
   - System generates: "X gathers their things and heads toward the exit..."
3. **State Snapshot**: Character state saved for rejoin continuity
4. **Participant Record**: Removed
5. **Event**: `chat.party_left` emitted

```typescript
DELETE /api/chats/:id/participants/:actorId
  response: {
    ok: true,
    departureNarration?: string  // VN transition text
  }
```

### Party Split (Branch Chat)

When the party decides to split at a location fork:

1. **Detection**: User narrates split OR uses explicit command
   - Regex: "we split up", "I'll go left, you go right"
   - Or: `/split alice,bob → forest` | `gm → cave`
2. **Branch Creation**:
   - For each sub-group:
     - Create new chat with `parent_chat_id = currentChatId`
     - Copy relevant context (recent messages, active quests)
     - Add sub-group participants
     - Set `current_location_id` to their chosen destination
3. **Narration**: Split narration posted in all affected chats
4. **VN Effect**: Screen split / parallel scenes
5. **Events**: `chat.party_split` emitted with branch info

```typescript
POST /api/chats/:id/split
  body: {
    branches: [
      { locationId: string, actorIds: string[], name?: string },
      { locationId: string, actorIds: string[], name?: string }
    ]
  }
  response: {
    ok: true,
    branches: [
      { chatId: string, locationId: string, participantCount: number }
    ],
    splitNarration: string
  }
```

### Party Reunite (Merge Chat)

When split parties reunite:

1. **Detection**: User narrates reunion OR uses explicit command
   - Regex: "we meet back", "the group reunites"
   - Or: `/reunite <chatId>`
2. **Merge Logic**:
   - Pick primary chat (most recent activity)
   - Merge messages from secondary into primary (chronological order)
   - Remove duplicate participants
   - Update `current_location_id` to reunion location
3. **Narration**: Reunion narration posted
4. **VN Effect**: Scene merge
5. **Events**: `chat.party_reunited` emitted

```typescript
POST /api/chats/:id/reunite
  body: { sourceChatId: string }
  response: {
    ok: true,
    mergedMessageCount: number,
    reunionNarration: string
  }
```

### VN-Driven Location Decisions

VN choice cards can drive location/party decisions:

```
[Scene: Crossroads]
The path splits ahead. Your party must decide.

[Card: "Head to the Dark Forest" → location:forest-123]
[Card: "Take the mountain pass" → location:mountain-456]
[Card: "Return to the village" → location:village-789]
```

Selecting a card triggers:

1. Location change (PUT /api/chats/:id/location)
2. VN scene transition
3. Optional: new section creation if sectioning is enabled

### AUX LLM Fallback for Transition Detection

Regex-based detection misses nuanced transitions. An AUX LLM provides
fallback classification with fast-resolution constraints:

| Constraint      | Value                  | Reason                        |
| --------------- | ---------------------- | ----------------------------- |
| Context window  | Last 1-2 messages only | Minimize token cost           |
| Max tokens      | 50-100                 | Fast response, JSON parseable |
| Temperature     | 0.0                    | Deterministic classification  |
| Response format | JSON only              | Structured output             |
| Timeout         | 2s                     | Fail fast, don't block        |
| Fallback        | No transition          | Graceful degradation          |

See `TASK-transition-aux-llm-fallback.md` for full design.

## Implementation Plan

### Phase 1: Party Join/Leave with VN Narration

- [ ] Extend `POST /api/chats/:id/participants` with entrance narration
- [ ] Extend `DELETE /api/chats/:id/participants/:actorId` with departure narration
- [ ] Wire VN scene renderer for entrance/exit animations
- [ ] Add character state snapshot on leave
- [ ] Add talkativity/initiative seeding for new members

### Phase 2: AUX LLM Transition Fallback

- [ ] Create `src/chat/transition-classifier.ts`
- [ ] Implement regex-first, AUX-LLM-fallback detection
- [ ] Wire into message processing pipeline
- [ ] Add timeout and error handling

### Phase 3: Party Split/Merge

- [ ] Create split detection regex patterns
- [ ] Implement `POST /api/chats/:id/split` endpoint
- [ ] Implement `POST /api/chats/:id/reunite` endpoint
- [ ] Add VN split/reunite visual effects
- [ ] Wire parent-child chat linking

### Phase 4: VN Choice Card Integration

- [ ] Extend choice card types with location actions
- [ ] Wire card selection to location change API
- [ ] Add travel progress UI for long distances
- [ ] Add party roster panel showing who's where

## Files to Create

- `src/chat/transition-classifier.ts` — AUX LLM fallback classifier
- `src/routes/chat-party.ts` — party join/leave/split/reunite endpoints

## Files to Modify

- `src/routes/chats.ts` — extend participant endpoints
- `src/chat/service.ts` — add party state snapshot, narration generation
- `src/chat/transitions.ts` — wire AUX classifier, emit party events
- `src/chat/types.ts` — add party event types
- `src/frontend/vn/scene-renderer.ts` — entrance/exit animations
- `src/frontend/vn/choice-cards.ts` — location action cards
- `src/frontend/alpine/chat.ts` — party roster panel
- `src/frontend/alpine/chat-types.ts` — party state types

## Acceptance Criteria

- [ ] Party join generates VN entrance narration
- [ ] Party leave generates VN departure narration + state snapshot
- [ ] AUX LLM fallback detects transitions regex misses
- [ ] AUX LLM fails fast (2s timeout) with graceful degradation
- [ ] Party split creates branched chats with correct participants
- [ ] Party merge combines messages and deduplicates participants
- [ ] VN choice cards can trigger location changes
- [ ] All existing chat tests still pass

## Verification

```bash
bun run check
bun test src/chat/
bun test src/routes/chats.ts
bun test src/routes/chat-search.ts
```
