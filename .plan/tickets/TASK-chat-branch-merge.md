<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Split/Reunite Engine (Party Branch & Merge)

**Status:** 🔴 Not Started
**Priority:** P2-B
**Effort:** High
**Epic:** epic-chat-transfer-location
**Related:** TASK-travel-party-migration.md (umbrella), TASK-party-join-leave.md, TASK-party-aux-transition.md

## Summary

Phase 3 (and Phase 4) of travel-party migration: the chat split/reunite engine
plus VN choice-card-driven location changes. This is the hardest phase — it
depends on a stable party model from Phases 1–2, then adds party split (branch
chat), reunite (merge chat), and VN choice cards that trigger location actions.

## Context

### Party Split (Branch Chat)

When the party decides to split at a location fork:

1. **Detection**: User narrates split OR uses explicit command
   - Regex: "we split up", "I'll go left, you go right"
   - Or: `/split alice,bob → forest` | `gm → cave`
2. **Branch Creation**: For each sub-group, create a new chat with
   `parent_chat_id = currentChatId`, copy relevant context (recent messages,
   active quests), add sub-group participants, set `current_location_id` to
   their chosen destination
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
2. **Merge Logic**: Pick primary chat (most recent activity), merge messages
   from secondary into primary (chronological order), remove duplicate
   participants, update `current_location_id` to reunion location
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

### VN Choice Card Integration

VN choice cards can drive location/party decisions:

```
[Scene: Crossroads]
The path splits ahead. Your party must decide.

[Card: "Head to the Dark Forest" → location:forest-123]
[Card: "Take the mountain pass" → location:mountain-456]
[Card: "Return to the village" → location:village-789]
```

Selecting a card triggers: (1) location change (`PUT /api/chats/:id/location`),
(2) VN scene transition, (3) optional new section creation if sectioning is
enabled.

## Implementation Plan

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

## Acceptance Criteria

- [ ] Party split creates branched chats with correct participants (Phase 3)
- [ ] Party merge combines messages and deduplicates participants (Phase 3)
- [ ] VN choice cards can trigger location changes (Phase 4)
