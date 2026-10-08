<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Travel Mode — Party Migration Between Chats (Umbrella)

**Summary:** Umbrella ticket for travel-mode party migration between chats: party join/leave, AUX transition fallback, party split/reunite, and VN choice-card location actions.
**Context:** A party is not a separate entity — it is the set of characters sharing a chat in group/story mode, already represented via `chat_participants`; no `parties` table. Phases 1-3 are code-shipped; Phase 4 (VN choice-card integration) is not started and is owned by `TASK-chat-branch-merge.md`.
**Acceptance Criteria:** Phase 1 party join/leave with VN narration ships (`joinParty`/`leaveParty`); Phase 2 AUX LLM transition fallback ships; Phase 3 party split/reunite engine ships (`splitParty`/`reuniteChats` + routes); Phase 4 VN choice cards trigger location changes — OPEN.


**Status:** Done
**Status Note:** Umbrella scope is closed: Phases 1-3 shipped and verified on dev (`joinParty`/`leaveParty` in `src/chat/service/party.ts`, split engine in `src/chat/service/split.ts` + routes). The remaining Phase 4 VN choice-card work is tracked in `TASK-chat-branch-merge.md` (In Progress). Previously marked `In Progress` by a 2026-10-08 edit; `giwt sync` maps the closed registry issue to `Done` unconditionally, so `Done` is this ticket's permanent status — do NOT reset it to `In Progress`; Phase 4 lives in the child ticket.
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

- **Phase 1 — Party join/leave with VN narration**: ✅ Done 2026-08-19 — see tasks below; verified in code 2026-10-08 (`joinParty`/`leaveParty` in `src/chat/service/party.ts`, routes `src/routes/chats/participants.ts`)
- **Phase 2 — AUX LLM transition fallback**: ✅ Done 2026-08-01 — see `TASK-party-aux-transition.md`
- **Phase 3 — Party split/reunite engine**: ✅ Code shipped 2026-10-08-verified — `splitParty`/`reuniteChats` in `src/chat/service/split.ts` + routes `src/routes/chats/split.ts` (regex narration detection + VN split/reunite effects still open, tracked under `TASK-chat-branch-merge.md`)
- **Phase 4 — VN choice card integration**: 🔴 Not Started — see `TASK-chat-branch-merge.md`

> _(earlier note read "Phase 3 Not Started" — superseded: the engine + routes are in the tree and covered by `src/chat/service/split.test.ts` / `branch-nav.test.ts`)_


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

**Resolved:** 2026-10-08 registry-driven close: git issue 58bb561 (registry tip: 75eca8bfb Konstantin Fedotov Close issue)
