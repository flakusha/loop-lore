<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Character Stat Allocation Frontend Modal And Edit Integration

**Epic:** epic-character-core-system
**Related:** TASK-world-requires-stats-flag-and-point-budget-config, TASK-character-trait-catalog-for-gameplay-mechanics, TASK-character-stat-allocation-backend-api-and-db-integration

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

New htmx partial + Alpine.js modal for the point-buy budget, six ability sliders, and gameplay-trait multi-select, gated by world `requires_stats`.

**Context:**

The backend gates character creation behind stat allocation, but authors still need a usable surface to make those choices. This ticket adds a htmx partial + Alpine component that surfaces the point-buy budget, the six ability sliders, and the trait multi-select. It lives next to the character create/edit screens and is forced when the active world opts in. The sibling `TASK-frontend-actor-traits-location-and-world` ticket already covers the actor-scoped narrative traits — this ticket is strictly about gameplay-mechanic trait selection.

**Acceptance Criteria:**

Modal `src/frontend/modals/stat-allocation.html` (htmx partial + Alpine `x-data`) reached from `src/views/characters/*.html`. Triggered when the active world's `requires_stats` is true. UI: live point-budget header = `stat_point_budget - sum(stats)`; six STR/DEX/CON/INT/WIS/CHA sliders bounded to `stat_min`/`stat_max` (8–15 default) with +/- nudges and numeric input snapping to range; computed ability modifier shown beside each. Trait picker: multi-select of catalog entries exposed via new `GET /api/rpg/trait-catalog?worldId=…` (sibling route), grouped by scope (universal vs world-scoped) with one-line descriptions. Save calls `PUT /api/actors/:actorId/stat-allocation`; 422 surfaces per-field errors inline. On character create/edit, when world requires stats and no allocation exists, the form blocks submit and routes to the modal first. State preserved across modal re-opens. Alpine-only, no new deps.

