<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Party Join/Leave with VN Narration

**Status:** 🟡 Partial — Phase 1 landed 2026-08-19; VN renderer wiring + state snapshot open
**Priority:** P2-B
**Effort:** High
**Epic:** epic-chat-transfer-location
**Related:** TASK-travel-party-migration.md (umbrella), TASK-party-aux-transition.md, TASK-chat-branch-merge.md

## Summary

Phase 1 of travel-party migration: implement party join/leave mechanics with
VN-driven entrance/exit narration. A "party" is the set of characters sharing a
chat in group/story mode (implicit via `chat_participants` — no `parties`
table is needed).

## Context

Already shipped (2026-08-19): `joinParty` / `leaveParty` in
`src/chat/service/party.ts`, participant endpoints in
`src/routes/chats/participants.ts`, the `guest` role on `ChatParticipantRole`,
and VN join/leave narration. Open work: VN scene-renderer wiring for
entrance/exit animations and a character state snapshot on leave for rejoin
continuity (both tracked as tasks inside this ticket).

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

## Implementation Plan

### Phase 1: Party Join/Leave with VN Narration

- [x] Extend `POST /api/chats/:id/participants` with entrance narration — done 2026-08-19 (`src/chat/service/party.ts` `joinParty`)
- [x] Extend `DELETE /api/chats/:id/participants/:actorId` with departure narration — done 2026-08-19 (`leaveParty`)
- [x] Add talkativity seeding for new members (default 5); initiative relies on DB default 0
- [x] Add `guest` role to `ChatParticipantRole` enum + validation; frontend role select fixed to real enum values
- [x] Idempotent rejoin (rejoin with same role → no-op success)
- [ ] Wire VN scene renderer for entrance/exit animations (frontend, separate ticket)
- [ ] Add character state snapshot on leave (rejoin continuity, separate ticket)

## Acceptance Criteria

- [x] Party join generates VN entrance narration (VN-mode chats)
- [x] Party leave generates VN departure narration (VN-mode chats)
- [x] Idempotent join; not_found for missing chat / non-member leave
- [x] `guest` role accepted end-to-end (enum → schema → route → service → frontend)
- [ ] Character state snapshot on leave (open)
