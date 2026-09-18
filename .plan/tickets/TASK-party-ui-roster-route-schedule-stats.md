<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Party UI Roster Route Schedule Stats

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-party-migration
**Tags:** party, ui

**Summary:**
Party UI: roster, route, schedule, party-state/stats - accessible from chat header and world admin.

**Context:**
Players need to see roster, current route, scheduled arrival, and cohesion/economy at a glance.

**Acceptance Criteria:**
- Alpine component `party-panel`: tabs for Roster / Route / Schedule / Stats.
- Embeds inside chat header (party chip) and world admin page.
- Cohesion and economy widgets at a glance.
- Tests: snapshot of party state; admin can disband; member can leave.
