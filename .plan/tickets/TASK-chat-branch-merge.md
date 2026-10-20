<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Split/Reunite Engine (Party Branch & Merge)

**Summary:** Phase 3 (party split/reunite engine) and Phase 4 (VN choice-card location actions) of the travel-party migration umbrella `TASK-travel-party-migration.md`.
**Context:** Depends on the stable party model from Phases 1-2 (`TASK-party-join-leave.md`, `TASK-party-aux-transition.md`). Split branches a chat via `POST /api/chats/:id/split` into per-sub-group child chats with `parent_chat_id` and copied context; reunite merges secondary chats back via `POST /api/chats/:id/reunite`. VN choice cards carry a `location:` action that drives `PUT /api/chats/:id/location`.
**Acceptance Criteria:** Party split creates branched chats with correct participants; party merge combines messages and deduplicates participants (Phase 3); VN choice cards can trigger location changes (Phase 4).


**Status:** In Progress
**Status Note:** split/reunite engine + routes shipped (verified 2026-10-08); regex narration detection helpers + scene-transition wiring landed 2026-10-20 (`detectSplitIntent`/`detectReuniteIntent` in `src/chat/service/split.ts`, wired in `src/routes/messages/handle-scene-transitions.ts`). Remaining: auto-execution of split/reunite from narration (needs branch specs: locations + actor sets), VN split/reunite + choice-card location effects.
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

- [x] Implement `POST /api/chats/:id/split` endpoint — shipped (`src/routes/chats/split.ts`, IDOR-guarded, `splitParty` service)
- [x] Implement `POST /api/chats/:id/reunite` endpoint — shipped (same file, `reuniteChats` service)
- [x] Wire parent-child chat linking — shipped (`parent_chat_id` on branch chats, carried context via `carry-*` modules)
- [ ] Create split/reunite detection regex  patterns — narration path open
- [ ] Add VN split/reunite visual effects — open

### Phase 4: VN Choice Card Integration

- [ ] Extend choice card types with location actions
- [ ] Wire card selection to location change API
- [ ] Add travel progress UI for long distances
- [ ] Add party roster panel showing who's where

## Acceptance Criteria

- [x] Party split creates branched chats with correct participants (Phase 3) — `splitParty` (`src/chat/service/split.ts:81`) → `createBranchChat` per sub-group with `parent_chat_id`, destination `current_location_id`, and the branch's `actorIds`
- [x] Party merge combines messages and deduplicates participants (Phase 3) — `reuniteChats` (`src/chat/service/split.ts:170`) → `copyMessagesToPrimary` + `mergeParticipantsIntoPrimary` (dedupes by `actor_id`, `src/chat/service/split-utils.ts:82`); covered by `src/chat/service/split.test.ts`
- [ ] VN choice cards can trigger location changes (Phase 4)

## Auto-execution research (2026-10-20)

- `detectSplitIntent`/`detectReuniteIntent` only detect narration; they do not carry branch specs (locations + actor sets) or a secondary chat id.
- No `/split`/`/reunite` command exists in `src/routes/messages/command.ts`; execution requires either explicit command syntax with branch specs or GM/assistant derivation.
- Safe auto-execution therefore needs a separate task: command parser + branch spec validation + owner/permission guards + tests. Detection wiring remains the scope of this slice.

## Aux/0-shot classification (2026-10-20)

- Regex detection is deterministic and cheap; aux LLM could derive branch specs (locations/actors) from narration, but that adds latency/cost and failure modes.
- Recommend a SEPARATE ticket for aux-driven branch proposal (mirroring `classifyTransition`), keeping regex detection in this slice. Rationale: different verification (LLM eval corpus) and rollback surface.

## Auto-execution scope (2026-10-20)

- Minimal scope: detect + log only (shipped). Full execution requires explicit command syntax + branch specs and is tracked separately.
