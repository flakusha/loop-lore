<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Faction Standing And Reputation Drift Integration

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-faction-reputation
**Tags:** factions, reputation

**Summary:**
Drift faction standing over time based on actions and rumor propagation (without rewriting the existing reputation API).

**Context:**
Faction standing is currently per-character or per-faction-table; the world-RPG batch wants standing to drift based on recent actions (helping a faction adds positive drift) and on memory-propagated rumors between factions.

**Acceptance Criteria:**
- Periodic drift on world tick (uses `epic-time-scale` cadence) reads `faction_actions` log, applies signed deltas to each faction standing row.
- Memory propagation: `epic-memory-propagation` shares rumors between aligned factions; this ticket consumes those and feeds them as standing mod events.
- Stop-loss rule: standing cannot drift past `clamp(min,max)`.
- Action log append-only; tests verify drift math.
- Backed by `epic-world-diplomacy-karma` for display ("Reputation: +45 with The Iron Wardens").
