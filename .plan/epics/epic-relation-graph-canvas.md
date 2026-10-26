<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Relation Graph Canvas

**Overview:** (see sections below)

**Status:** Not Started
**Priority:** P2
**Effort:** Large
**Type:** Feature Epic / Frontend Visualization
**Tags:** canvas, relationships, graph, visualization, 2d
**Issue:** (none)

## Summary

Relationship data (documents, factions, locations/travel, memories, story
entities, story timeline) is only visible as tables. This epic renders each
relation family as an interactive 2D canvas graph with one shared rendering
foundation, backend-first data contracts, and per-family graph semantics.

## Scope

1. **Shared canvas foundation**: one 2D graph renderer (nodes, edges, layout,
   zoom/pan, selection) reused by every family view.
2. **Backend-first contracts**: each family exposes graph-shaped endpoints
   (nodes/edges) before its frontend view lands.
3. **Family views**: document, faction, location/travel, memory, story-entity
   graphs, and a story-timeline 2D view on the same foundation.

## Tasks

- [ ] `TASK-document-asset-relation-graph-on-2d-canvas`
- [ ] `TASK-faction-relation-graph-on-2d-canvas-backend-first`
- [ ] `TASK-location-travel-graph-on-2d-canvas`
- [ ] `TASK-memory-relation-graph-on-2d-canvas`
- [ ] `TASK-story-entity-relation-graph-on-2d-canvas`
- [ ] `TASK-story-timeline-view-on-2d-canvas`

## Acceptance Criteria

- [ ] One shared canvas graph renderer; no per-family forks of layout/zoom/selection
- [ ] Each family view renders from a graph-shaped endpoint (nodes/edges) with ownership checks
- [ ] Large graphs (500+ nodes) pan/zoom at interactive frame rates
- [ ] Per-family tests cover data contract and rendering wiring

## Related Epics

- `epic-relationships.md` — the relation data model these views render
- `epic-frontend-component-architecture.md` — component conventions for the shared renderer

## Bind Tickets

- `TASK-document-asset-relation-graph-on-2d-canvas.md` (open)
- `TASK-faction-relation-graph-on-2d-canvas-backend-first.md` (open)
- `TASK-location-travel-graph-on-2d-canvas.md` (open)
- `TASK-memory-relation-graph-on-2d-canvas.md` (open)
- `TASK-story-entity-relation-graph-on-2d-canvas.md` (open)
- `TASK-story-timeline-view-on-2d-canvas.md` (open)


git issue: b5de589
