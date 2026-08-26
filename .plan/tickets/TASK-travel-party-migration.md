<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Travel Mode — Party Migration Between Chats (Umbrella)

**Status:** 🟡 In Progress — split into 3 child tickets (Phase 1 ✅ done; Phase 2 ✅ done; Phases 3–4 🔴 open)
**Priority:** P2-B
**Effort:** High
**Epic:** epic-chat-transfer-location
**Tags:** travel, party, migration, chat, location, multi-location

## Goal

Party join/leave mechanics with VN-driven transitions, plus party split/merge
and VN choice-card-driven location changes. When characters move between
locations, the party (including GM) can join an existing chat, create a new
chat, split into sub-parties, or reunite split parties.

## Status

- **Phase 1 — Party join/leave with VN narration**: ✅ Done 2026-08-19 — see `TASK-party-join-leave.md`
- **Phase 2 — AUX LLM transition fallback**: ✅ Done 2026-08-01 — see `TASK-party-aux-transition.md`
- **Phase 3 — Party split/reunite engine**: 🔴 Not Started — see `TASK-chat-branch-merge.md`
- **Phase 4 — VN choice card integration**: 🔴 Not Started — see `TASK-chat-branch-merge.md`

## Children

- `TASK-party-join-leave.md` — Phase 1: party join/leave with VN narration
- `TASK-party-aux-transition.md` — Phase 2: AUX LLM transition detection fallback
- `TASK-chat-branch-merge.md` — Phase 3: chat split/reunite engine + Phase 4: VN choice card integration

## Shared Context

### Party = Implicit via Shared Chat

A "party" is not a separate entity — it is the set of characters sharing a
chat in group/story mode, already represented via `chat_participants`. No
`parties` table is needed; party mechanics operate on `chat_participants`.

```
Chat "Dungeon Crawl" (group, story mode)
├── Participant: Alice (user)
├── Participant: Bob (AI character)
├── Participant: GM (AI character)
└── All three are the "party"
```

### Party Join Flow

1. **API**: `POST /api/chats/:id/participants` with `actorId`
2. **VN Transition**: Entrance narration (system-generated, or character's `welcome_message`)
3. **State Load**: Character stats/inventory loaded from DB
4. **Participant Record**: Created with default talkativity (5) and initiative (0)
5. **Event**: `chat.party_joined` emitted

### Party Leave Flow

1. **API**: `DELETE /api/chats/:id/participants/:actorId`
2. **VN Transition**: Departure narration
3. **State Snapshot**: Character state saved for rejoin continuity
4. **Participant Record**: Removed
5. **Event**: `chat.party_left` emitted

### AUX LLM Fallback for Transition Detection

Regex-based detection misses nuanced transitions; an AUX LLM provides fallback
classification with fast-resolution constraints (see `TASK-party-aux-transition.md`
and `TASK-transition-aux-llm-fallback.md` for the full design).

### Sequencing

Join/leave first → aux-transition next → branch-merge last (hardest, depends on
a stable party model from Phases 1–2).
