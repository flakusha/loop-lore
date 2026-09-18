<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Location Travel Connected Fast And Free Jump

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-world-travel-time
**Tags:** location, travel, fast-travel

**Summary:**
Implement connected/bound/free-travel between locations via adjacency, fast-travel, and free-jump.

**Context:**
Existing location model lists locations but lacks a first-class location graph. World-RPG wants multiple travel modes selectable by the player.

**Acceptance Criteria:**
- `location_edges` table: `(from_id, to_id, mode enum(walk|ride|fly|teleport|port-gate|free-jump), game_hours, requires_discovery bool, cost_json)`.
- Routes: `POST /api/locations/:id/edges` (admin), `POST /api/locations/:id/travel` body `{ toId, mode }` (user).
- For `"free-jump"`, cost honored (`TASK-party-free-jump-location-graph-edge`).
- Discovery gating (`TASK-location-graph-editor-and-discovery-gating`).
- Tests: adjacency succeeds; fast-travel on unknown edge rejected; free-jump cost deducted.
