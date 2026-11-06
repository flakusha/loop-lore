<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: World & Location Management UI

**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** Shipped except two open items. (1) The location explorer's tree/grid view toggle landed in bc020d002 (ancestor of this branch): `src/views/world-edit.html:729-746` renders the Tree/Grid buttons, `src/frontend/alpine/location-explorer.ts:65` holds `viewMode: "tree"`, `src/frontend/alpine/location-explorer-controls.ts:44-46` switches it. (2) The full-page editor at `src/views/world-edit.html` IS reachable: the world-list card navigates to `/worlds/{id}` (`src/routes/views/worlds-list.ts:155`), the world-detail page's location panel "Explore" button (`src/components/world-location-panel.html:108-114`) calls `navigateExplore()` → `globalThis.location.assign(`/worlds/${this.worldId}/edit`)` (`src/frontend/alpine/location-actions.ts:75-77`), and `GET /worlds/:id/edit` serves the editor (`src/routes/views/plugin-pages.ts:115-120` → `serveWorldEdit`, `src/routes/views/view-serving.ts:142-159`); the editor prefills name/description/lore from `GET /api/v1/worlds/{id}` (`src/frontend/alpine/world-edit.ts:46-84`). The wizard's edit-prefill mode is therefore superseded by that full-page editor: `worldCreateWizard.save()` persists only name/description/kind/visibility/rpgEnabled/rpgXp/rpgSkills (`src/frontend/alpine/world-create-wizard.ts:270-281`), it cannot persist `style` (no `style` column on `worlds` — `src/db/schema-story.ts:136-165`) and it cannot persist the conditions step (`handleUpdateWorld` writes only name/description/lore/scanDepth/tokenBudget/difficulty*/kind/visibility/autonomy/rpg flags — `src/routes/worlds/worlds.ts:186-206`; no time/weather/season columns exist on `worlds`). The search-preview defect (search rendering a bare card instead of the list previews) was fixed in 663efc8bc — search now reuses `renderWorldCard` (`src/routes/views/search.ts:199-205`). Still open: (a) fast travel unlock status — no unlock/lock concept exists in the travel stack (`travel_parties.status` is a free-text CHECK of 'idle'/'traveling'/'resting'/'disbanded', `src/db/migrations/040_world_travel_simulation.ts:66`; no `fast_travel`/`fastTravel` symbol exists anywhere under `src/`), so that AC stays unticked until a backend concept is specified; (b) the world edit modal still renders blank fields — `src/partials/worlds/edit-modal.html:26,31-39,48-56` emit no `value`/text content, and the partial is served by the static, DB-less route (`src/routes/views/static-partials.ts:14-35` via `src/routes/views/plugin-static.ts:12-27`), so prefilling it needs a DB-backed serving path (e.g. a `/dynamic/worlds/:id/edit-modal` route mirroring the existing `/dynamic/characters/:id/edit-form`, `src/routes/views/plugin-dynamic.ts:242-254`) — not built yet.
**Priority:** P0 — Critical
**Effort:** High
**Type:** Feature Epic
**Tags:** world, locations, travel, ui, frontend
**Parent Epic:** World & Locations (epic-world-locations.md)

## Summary

Complete world and location management interface, including world CRUD, location explorer, travel system, and time/weather display. Required to make the world system usable by end users.

## Core Features

### World Management Dashboard

- World list with previews
- Create new world wizard
- World settings editor
- World conditions display (weather, time, season)
- World lore editor

### Location Explorer

- List view (compact, sortable)
- Grid view (cards with previews)
- Map view (visual representation)
- Location details panel
- Location search and filter

### Travel Interface

- Route selection (origin → destination)
- Travel time estimation
- Travel mode selection (walk, ride, fly, teleport)
- Travel progress indicator
- Fast travel unlock status
- Travel hazards display

### Time & Weather Display

- Current time widget (day/night cycle)
- Weather indicator
- Season display
- Time progression controls (for GM)

## UI Components

### World Dashboard Layout

<!-- ASCII UI mockup removed in favor of prose description: see preceding/following sections. -->

### Location Explorer Layout

<!-- ASCII UI mockup removed in favor of prose description: see preceding/following sections. -->

### Travel Interface Layout

<!-- ASCII UI mockup removed in favor of prose description: see preceding/following sections. -->

### Travel Progress Display

<!-- ASCII UI mockup removed in favor of prose description: see preceding/following sections. -->

## Integration Points

### Backend Dependencies

| Backend System  | What It Provides            | How Used           |
| --------------- | --------------------------- | ------------------ |
| World System    | World CRUD, conditions      | Display world data |
| Location System | Location CRUD, connections  | Display locations  |
| Travel System   | Travel mechanics, hazards   | Calculate travel   |
| Time System     | Time progression, day/night | Display time       |
| Weather System  | Weather effects             | Display weather    |
| NPC System      | NPC placement, schedules    | Display NPCs       |
| Resource System | Resource extraction         | Display resources  |

### Shared Components

| Component            | Used By             | Notes                      |
| -------------------- | ------------------- | -------------------------- |
| Health bar widget    | World, NPC, Battle  | Reusable across systems    |
| Status effect badges | World, NPC, Disease | Shared buff/debuff display |
| Map/Location view    | World, Travel, NPC  | Reusable location display  |
| Time/weather widget  | World, Travel, NSFW | Reusable time display      |

## Acceptance Criteria

- [x] World list with previews and search — (src/views/worlds.html:51-63; src/routes/views/search.ts:203-205; src/routes/views/worlds-list.ts:147-166)
- [x] Create new world wizard — (src/views/worlds.html:23; src/partials/worlds/create-wizard.html:17-18; src/frontend/alpine/world-create-wizard.ts:199-249)
- [x] World conditions display (weather, time, season) — engine-backed, TASK-time-weather
- [x] Location explorer (list/grid views) — (src/views/world-edit.html:726-746; src/frontend/alpine/location-explorer.ts:65; src/frontend/alpine/location-explorer-controls.ts:44-46)
- [x] Location details panel with connections — (src/components/world-location-panel.html:62-82; src/views/world-detail.html:151; src/frontend/alpine/location-details.ts:52-86)
- [x] Travel interface with route selection — (src/components/world-travel-panel.html:13-36,77-126; src/frontend/alpine/travel-interface.ts:89,122,147)
- [x] Travel mode selection (walk/ride/teleport) — (src/components/world-travel-panel.html:38-53; src/frontend/alpine/travel-methods.ts:26-31)
- [x] Travel progress indicator — (src/components/world-travel-panel.html:139-153; src/routes/worlds/travel-status.ts:48)
- [x] Travel hazards display — (src/components/world-travel-panel.html:158-160; src/components/world-location-panel.html:62-64)
- [ ] Fast travel unlock status — no unlock/lock concept exists in the travel stack (travel_parties.status is free text: "traveling"/"resting"); see Status Note
- [x] Time/weather display widget — TASK-time-weather
- [x] Mobile responsive — (src/public/css/app.css:2455-2458,4336-4339,4458-4460,2587; src/public/css/responsive.css:7)
- [x] Keyboard shortcuts — (src/frontend/alpine/shortcuts.ts:57-59; src/frontend/alpine/world.ts:110-120; src/public/locales/en.json:92-94)
- [x] Accessibility (ARIA labels) — (src/views/worlds.html:6,15,27,38; src/partials/worlds/create-wizard.html:17-18)

## Implementation Phases

### Phase 1: World Dashboard

- World list component
- World conditions display
- World settings editor

### Phase 2: Location Explorer

- Location list/grid views
- Location details panel
- Location search/filter

### Phase 3: Travel Interface

- Route selection
- Travel mode selection
- Travel progress display

### Phase 4: Time & Weather

- Time widget
- Weather display
- Season indicator

### Phase 5: Polish

- Mobile responsive
- Keyboard shortcuts
- Accessibility
- Animations

## Tasks

| Task                      | Priority | Status         |
| ------------------------- | -------- | -------------- |
| TASK-world-dashboard.md   | P0       | ⬜ Not Started |
| TASK-location-explorer.md | P0       | ✅ Done (2026-08-22) |
| TASK-travel-interface.md  | P0       | ⬜ Not Started |
| TASK-time-weather.md      | P0       | ⬜ Not Started |
| TASK-location-details.md  | P0       | ⬜ Not Started |
| TASK-world-alpine.md      | P0       | ⬜ Not Started |

## Current files

- `src/routes/views/worlds.ts` — worlds routes (list/detail/edit/IO).
- `src/views/worlds.html` — world list page and modal triggers.
- `src/views/world-detail.html` — world detail with location explorer.
- `src/views/world-edit.html` — world editor.
- `src/frontend/pages/worlds.ts` — world page actions.
- `src/frontend/pages/worlds-io.ts` — world import/export actions.
- `src/frontend/pages/world-timeline-bar.ts` — world timeline bar component.
- Alpine components: `location-explorer` (+ controls), `world-edit`, items/invites/channels/admin-worlds.

## Related Epics

- **Epic World & Locations** — Backend world system
- **Epic Travel & Time** — Backend travel mechanics
- **Epic Weather & Environment** — Backend weather system

