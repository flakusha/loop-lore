<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Location Graph Editor And Discovery Gating

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-world-travel-time
**Tags:** location, graph, discovery

**Summary:**
Admin UI for editing the location graph plus discovery-gating rule (edges only travelable after their endpoints are discovered).

**Context:**
Without a graph editor, every edge is hand-coded into seed data. With discovery-gating, certain edges reveal only after the player has visited both endpoints (avoiding metagaming).

**Acceptance Criteria:**
- Admin view: location graph editor (nodes + edges), drag-to-connect, edge attribute editor.
- Discovery rule: `requires_discovery` boolean on edge; travel attempted on locked edge returns `404 not-yet-discovered` until both endpoints have a visit record.
- Front end lazy-loads the player-discovered subgraph; undiscovered edges hidden.
- Tests: lock rejects locked travel; visit unlocks; admin can force unlock.
