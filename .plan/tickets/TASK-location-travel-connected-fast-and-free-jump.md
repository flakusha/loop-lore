<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Location Travel Connected Fast And Free Jump

**Status:** Done
**Status Note:** 2026-11-10 (release-010-closeout): the location graph shipped — the `location_edges` table (`src/db/migrations/053_location_edges.ts`: from/to, mode, game_hours, requires_discovery, cost_json, unique per pair+mode), the world-scoped edge routes (`POST/GET /api/v1/worlds/:worldId/locations/:locId/edges`, `PUT/DELETE /api/v1/worlds/:worldId/edges/:edgeId`, `POST /api/v1/worlds/:worldId/locations/:locId/travel`, `POST .../discover` — `src/routes/worlds/location-edges.ts`), the edge services (`src/locations/edge-core.ts`, `edge-discovery.ts`, `edge-graph.ts`, `edge-travel.ts`) and the graph editor (`src/frontend/alpine/location-graph.ts`). The routes are world-scoped and world-owner-gated rather than the ticket's global `/api/locations/:id/...` shape.
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
