<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: World & Location Management UI

**Overview:** (see sections below)


**Status:** Done
**Status Note:** All 15 acceptance boxes shipped; fast-travel unlock gated server-side in `PUT /chats/:id/location` via `src/locations/fast-travel.ts` (403 until discovery latch, owner/admin bypass).
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
- [x] Fast travel unlock status — server gate in `PUT /chats/:id/location` (`src/locations/fast-travel.ts` + `src/routes/chats/extras.ts`): destinations with a `requires_discovery` inbound edge reject with 403 until a caller actor latches `location_discovery`; world owner / `admin.world` bypass; unlocked state persists via the discovery latch (041) / force-discover (owner route)
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
| TASK-world-dashboard.md   | P0       | ✅ Done (2026-10-11) |
| TASK-location-explorer.md | P0       | ✅ Done (2026-08-22) |
| TASK-travel-interface.md  | P0       | ✅ Done (2026-10-11) |
| TASK-time-weather.md      | P0       | ✅ Done (2026-11-01) |
| TASK-location-details.md  | P0       | ✅ Done (2026-10-11) |
| TASK-world-alpine.md      | P0       | ✅ Done (2026-10-11) |

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

