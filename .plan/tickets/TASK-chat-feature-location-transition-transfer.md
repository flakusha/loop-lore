<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Location Transition via New Chat or Context Isolation + Party Handoff

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Epic:** epic-chat-product-features

## Summary

Support location transitions either by creating a new chat rooted in the destination location or by isolating the current chat's context into a scoped shard. Transfer events must carry the party intact: members, state, and active memory anchors move with the transition.

## Acceptance Criteria

- [ ] User can choose between (a) create new chat at destination, (b) isolate current chat context, (c) update location in place
- [ ] New-chat creation carries participants, world-state, and recent memory via `src/chat/service/carry-*`
- [ ] Context isolation shards the chat into a destination-locked scope without losing continuity
- [ ] Party members are atomically moved together — no orphan participants
- [ ] Transfer emits a transition event consumed by `src/chat/service/transitions.ts`
- [ ] Visible UI affordance in chat header / location panel

## Related Tickets / Epics

- epic-chat-product-features
- TASK-chat-sectioning-multi-location
- TASK-chat-transfer-location
- TASK-chat-locations-worlds-finalize-current-implementation
- TASK-chat-branch-merge
- FEAT-chat-transfer-location-change

## Files

- `src/chat/transitions.ts`
- `src/chat/service/transitions.ts`
- `src/chat/service/carry-location.ts`
- `src/chat/service/party.ts`
- `src/chat/service/party-narration.ts`
- `src/chat/types/transitions.ts`
- `src/chat/service/location-events.ts`

## Open Questions

- Are carry-over memories deep copies or references?
- When the user picks (b), is the original chat archived or retained?

