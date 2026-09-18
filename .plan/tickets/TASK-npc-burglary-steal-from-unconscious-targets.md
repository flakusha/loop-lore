<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: NPC Burglary Steal From Unconscious Targets

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-stealth-crime
**Tags:** burglary, steal, status-effects

**Summary:**
Burglary: steal from non-active, sleeping, stunned-for-long-time, paralyzed, etc. NPC targets.

**Context:**
Stealth-crime epic defines pickpocketing; this ticket extends to burglary of unattended NPCs (body on the floor, sleeping watchman). Status gating reuses `TASK-rpg-timed-conditions-buffs-with-stat-deltas`.

**Acceptance Criteria:**
- New endpoints: `POST /api/crime/burglary/target` body `{ npcActorId, itemId, exploit: "sleeping|stunned|paralyzed|unconscious" }`.
- Status check: NPC must have the matching status-effect; check uses status-service.
- Detection roll: `crime.detect`; failure logs `crime_instance` and triggers NPC detection reaction.
- Reuses `epic-stealth-crime` crime/bounty system.
- Tests: sleep status permits burglary, alert status does not; detection rolls deterministic given seed.
