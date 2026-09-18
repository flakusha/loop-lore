<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Party World Tick And Chat Transfer Integration

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-party-migration
**Tags:** party, world-tick, chat-transfer

**Summary:**
Party arrival events flow into chat transfer and world-tick scheduling.

**Context:**
When a party arrives at a location, the affected chats (player-led party, NPC retinue chats) need to either transfer to the new location or join existing chats. This integrates `epic-chat-transfer-location` with the new party abstraction.

**Acceptance Criteria:**
- `party:arrived` event triggers per-member chat transfer (reuses existing chat-transfer logic).
- World-tick scheduler calls `advancePartyTravel` for any party whose `cadence` is due.
- Hover/animation in chat UI shows party member arrival.
- Tests: arrival triggers transfer; tick cadence honors scheduler pause.
