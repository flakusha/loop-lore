<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RPG Mode — Single-Location Uniqueness Per Actor

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Medium
**Epic:** epic-chat-product-features

## Summary

In RPG mode, every actor entity (except admin/moderation) must occupy exactly one location at a time. The underlying rationale is the **audio-chat physical-presence model** (an "audio chat" — physical-presence model): a character / NPC / user is physically present in only one place in the world at any moment, so the chat surface must not place the same actor in multiple concurrent location chats. NPC movement is gated by the world opt-in; the system must reject or relocate on duplicate-location events and surface an indicator in the chat surface.

## Acceptance Criteria

- [ ] RPG-mode world opt-in (`TASK-rpg-gate-chat-commands-behind-world-opt-in`) is a hard prerequisite
- [ ] Each non-admin actor has at most one active location at any time (audio-chat physical-presence invariant)
- [ ] Location-change attempts that would create a duplicate are routed through `src/chat/npc-movement/index.ts`
- [ ] NPC movement indicator is visible in the chat header / sidebar
- [ ] Party management refuses to add an actor already present in another location unless admin-overridden
- [ ] When an actor is moved to a different location, all their active participation in chats anchored at the prior location is reconciled (paused / handed off) so they are not simultaneously active in two places
- [ ] Cross-instance enforcement is consistent across the party handoff pipeline (`src/chat/service/party.ts`)

## Related Tickets / Epics

- epic-chat-product-features
- epic-rpg-wiring-phase3
- epic-world-locations
- TASK-npc-movement-indicator-in-chat
- TASK-rpg-gate-chat-commands-behind-world-opt-in
- TASK-rpg-history-committing-chats-per-world

## Files

- `src/chat/npc-movement/index.ts`
- `src/chat/service/party.ts`
- `src/chat/proactive/types.ts`

## Open Questions

- Is an admin allowed to be present in multiple locations, or only mod?
- When a forced multi-location assignment occurs, how is it surfaced in the UI?

