<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: World & Location Management UI

**Overview:** (see sections below)


**Status:** ⬜ Not Started
**Priority:** P0 — Critical
**Effort:** High
**Type:** Feature Epic
**Tags:** world, locations, travel, ui, frontend

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

- [ ] World list with previews and search
- [ ] Create new world wizard
- [ ] World conditions display (weather, time, season)
- [ ] Location explorer (list/grid views)
- [ ] Location details panel with connections
- [ ] Travel interface with route selection
- [ ] Travel mode selection (walk/ride/teleport)
- [ ] Travel progress indicator
- [ ] Travel hazards display
- [ ] Fast travel unlock status
- [ ] Time/weather display widget
- [ ] Mobile responsive
- [ ] Keyboard shortcuts
- [ ] Accessibility (ARIA labels)

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

## Files to Create

- `src/frontend/world/world-dashboard.ts` — Main world page
- `src/frontend/world/location-explorer.ts` — Location browser
- `src/frontend/world/travel-interface.ts` — Travel UI
- `src/frontend/world/time-weather.ts` — Time/weather widget
- `src/frontend/world/location-details.ts` — Location details
- `src/frontend/alpine/world.ts` — Alpine.js world logic

## Related Epics

- **Epic World & Locations** — Backend world system
- **Epic Travel & Time** — Backend travel mechanics
- **Epic Weather & Environment** — Backend weather system
