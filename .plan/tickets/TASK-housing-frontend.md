<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Housing Frontend

**Status:** ⬜ Not Started
**Priority:** P2
**Effort:** High
**Epic:** epic-housing
**Tags:** housing, frontend, ui, room-layout, furniture, storage, neighborhood

## Summary

Create the dedicated housing frontend UI. This is **independent of the NSFW UI** — housing is its own domain. Backend (`/api/housing/*`) does not exist yet; this task follows the backend task.

## Scope

### 1. Housing Overview

- List player housing units
- Housing detail (rooms, size, condition)
- Housing creation/selection

### 2. Room Layout Visualization

- Room grid display
- Room toggling/add/remove
- Room assignment (NPCs, functions)

### 3. Furniture Placement

- Furniture placement grid
- Furniture catalog + category filter
- Place/move/rotate/remove furniture

### 4. Storage Management

- Storage container list
- Container contents view
- Item transfer in/out

### 5. Crafting Stations

- Station list
- Home crafting recipes
- Station tier/bonus display

### 6. Neighborhood (from TASK-housing-neighborhood.md)

- Neighborhood map with house icons
- Decoration contest panel with voting
- Visitor walkthrough mode

## Prerequisites

Backend housing routes (`/api/housing/*`) must exist first — see `TASK-housing-base-building.md` and `epic-housing.md`. This frontend task depends on them.

## Files to Create

- `src/frontend/alpine/housing.ts` — Housing UI Alpine component
- `src/components/housing/housing-panel.html` — Housing overview template
- `src/components/housing/room-layout.html` — Room layout template
- `src/components/housing/furniture-panel.html` — Furniture placement template
- `src/components/housing/storage-panel.html` — Storage template
- `src/components/housing/crafting-panel.html` — Crafting station template

## Acceptance Criteria

- [ ] Housing overview list + detail
- [ ] Room layout visualization
- [ ] Furniture placement grid
- [ ] Storage container management
- [ ] Crafting station view
- [ ] Neighborhood map + decoration contest (optional phase)
- [ ] Mobile responsive
- [ ] Keyboard accessible
- [ ] Independent of NSFW UI
- [ ] All calls map to real `/api/housing/*` routes

## Related

- `epic-housing.md` — Housing epic (this task's home)
- `epic-housing-base-building.md` — Base-building system design
- `TASK-housing-base-building.md` — Backend housing mechanics
- `TASK-housing-neighborhood.md` — Neighborhood + customization
- `TASK-housing-companion.md` — Companion housing
- `TASK-nsfw-housing.md` — Private space integration (cross-domain only)
- `TASK-nsfw-frontend-integration.md` — NSFW UI (does NOT own housing)
