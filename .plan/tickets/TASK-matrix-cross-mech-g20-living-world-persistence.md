<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-matrix-cross-mech-g20: Living-world persistence across time + between sessions

**Status:** open
**Priority:** medium
**Effort:** Large
**Type:** Task
**Summary:** Make the world keep moving when the player isn't looking: weather cycles, economy ticks, factions react, NPC relationships drift, narrative beats schedule themselves. Touches Weather, Economy, Faction, Social, Narrative, Exploration.
**Context:** `matrix-cross-mechanics.md` G20 is 🟡 Medium (future), P6+ deferred. Inspiration: AI Town, Nomi, AI Dungeon. The matrix says "extend world_events/timeline + 'world continues without you' (#14)." This is the cross-cutting stitching that ties existing systems into a continuous world clock rather than per-session state.

## Current state

- `world_events` and `timeline` exist but are session-scoped — events fire on user input only.
- Economy ticks on chat activity, not on time elapsed.
- Faction drift and NPC relationship drift require user interaction to advance.
- "World continues without you" is a named 0.1.0 aspirational bullet with no implementation.

**Acceptance Criteria:**

- [ ] Time-anchored scheduler (configurable cadence, default 1 game-hour) advances: weather, economy prices, faction reputation drift, NPC relationship drift, narrative beats.
- [ ] On session start, a "since you were last here" summary is composed from drift deltas (lazy — don't spam users).
- [ ] Each subsystem still owns its own state; scheduler only reads/writes through documented contracts.
- [ ] Tests pin: (a) world advances without user input, (b) summary composer produces deterministic output from seeded deltas, (c) per-system isolation (one slow subsystem can't block others).
- [ ] `bun run check` green.

**Tags:** world, persistence, scheduler, between-session, P6+, P6-0
**Related:** src/world/, src/timeline/, src/economy/, src/faction/, src/social/, .plan/matrix-cross-mechanics.md (G20 row), epic-emergent-narrative-design.md

git issue: c634f81
