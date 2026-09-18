<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Faction Politics Coups And Expansion Engine

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-faction-reputation
**Tags:** factions, politics, coups

**Summary:**
Tick-driven engine that handles faction politics: leader selection, coup attempts, expansion/shrink.

**Context:**
Existing faction epic tracks standing and reputation but lacks the dynamic lifecycle — factions should rise, fall, hold elections, suffer coups, expand territory. This ticket adds the simulation logic that fires those events from faction state and world-tick scheduling.

**Acceptance Criteria:**
- `src/factions/politics.ts` exports `tickFactionPolitics(worldId, currentTick, db)`: rolls internal stability + external pressure; on low stability fires `COUP_ATTEMPT` event (replace leader via `TASK-faction-leaders-and-cadre-generation`).
- Expansion: faction growth maps to territory expansion via location tags.
- Persistence: faction events table `faction_events(id, faction_id, kind, payload_json, tick, created_at)`.
- All events propagate to faction standing (`epic-faction-reputation`) and shadow-note arks (consumed by `epic-gm-shadow-notes`).
- Tests: deterministic seed reproduces events across runs.
