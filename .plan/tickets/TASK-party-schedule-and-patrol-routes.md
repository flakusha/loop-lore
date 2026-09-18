<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Party Schedule And Patrol Routes

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-party-migration
**Tags:** party, schedule, patrol

**Summary:**
Per-party schedule (continuous / scheduled / patrol) and patrol routes that the travel engine consumes.

**Context:**
NPC parties (caravans, patrols) move on their own schedule without a human driver. The patrol route is a list of locations; the scheduled mode fires at `startTime` and ends at `endTime`.

**Acceptance Criteria:**
- `PartySchedule` JSON shape: `startTime, endTime, cadence, patrolRoute: LocationId[], restingLocations: LocationId[]`.
- World-tick scheduler consults `cadence` to decide when to invoke `advancePartyTravel` for the party.
- Pause-aware: if a player pauses the world tick, all scheduled parties pause with it.
- Tests: schedule fires on time; resting locations skip "move" decisions; cadence jitter applied.
