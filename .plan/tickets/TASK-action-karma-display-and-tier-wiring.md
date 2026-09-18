<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Action Karma Display And Tier Wiring

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-world-diplomacy-karma
**Tags:** karma, display

**Summary:**
Surface karma deltas as a visible meter/tier in the UI; persist per-character and per-faction aggregates.

**Context:**
`epic-world-diplomacy-karma` defines karma architecture; this ticket wires the AUX-produced delta into display + tier bands.

**Acceptance Criteria:**
- Karma row per character: `character_karma(actor_id, alignment_axis, total_score, tier, last_event_at)`.
- Tier bands: `paragon | respected | neutral | suspected | villain` (configurable thresholds).
- UI element: progress meter in character sheet + world dashboard.
- Tooltip shows recent karma events sourced from `karma_events(actor_id, delta, reason, source, created_at)`.
- Tests: threshold crossings flip tier; admin can override tier (audit log).
