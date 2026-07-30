# EPIC: World & Location Management UI

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

```
┌─────────────────────────────────────────────────────────────┐
│ World: The Forgotten Realms                    ⚙️ Settings │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─ Conditions ─────────────────────────────────────────────┐│
│ │ 🌙 Night  🌧️ Rainy  🍂 Autumn  ⏰ Day 45, 14:30        ││
│ │ Global Modifiers: +10% Stealth, -20% Fire Damage        ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Locations (12) ─────────────────────────────────────────┐│
│ │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    ││
│ │ │ 🏰       │ │ 🌲       │ │ ⛰️       │ │ 🏚️       │    ││
│ │ │Castle    │ │Darkwood  │ │Mount     │ │Ruins     │    ││
│ │ │Forest    │ │          │ │Spire     │ │          │    ││
│ │ │ ⚠️ Danger│ │ 🌲 Forest│ │ ⛰️ Mountain│ │ 💀 High  │    ││
│ │ └──────────┘ └──────────┘ └──────────┘ └──────────┘    ││
│ │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    ││
│ │ │ 🏘️       │ │ 🏛️       │ │ 🌊       │ │ 🏔️       │    ││
│ │ │Village   │ │Temple    │ │Lake      │ │Peak      │    ││
│ │ │of Mist   │ │of Light  │ │          │ │          │    ││
│ │ │ 🟢 Safe  │ │ ✨ Holy  │ │ 🐟 Fish  │ │ ❄️ Cold  │    ││
│ │ └──────────┘ └──────────┘ └──────────┘ └──────────┘    ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ NPCs (8) ──────────────────────────────────────────────┐│
│ │ [Merchant] [Guard] [Blacksmith] [Healer] [Quest Giver] ││
│ │ [Innkeeper] [Guard Captain] [Mysterious Stranger]       ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Resources ──────────────────────────────────────────────┐│
│ │ 🪨 Iron: 45% | 🌲 Wood: 80% | 💧 Water: 60%           ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Location Explorer Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Locations: The Forgotten Realms        [+ Add] [🔍 Search] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─ Filters ────────────────────────────────────────────────┐│
│ │ Type: [All ▼]  Danger: [All ▼]  Discovered: [All ▼]   ││
│ │ Resources: [All ▼]  NPCs: [All ▼]                      ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ List ──────────────────────────────────────────────────┐│
│ │ 🏰 Castle Forest        ⚠️ High    🌲 Forest            ││
│ │    Resources: Wood 80%, Iron 45%                        ││
│ │    NPCs: 3 (Merchant, Guard, Guard Captain)             ││
│ │    Anomalies: 1 (Glowing Runes)                         ││
│ │                                                         ││
│ │ 🌲 Darkwood              🟢 Low    🌲 Forest            ││
│ │    Resources: Wood 95%, Herbs 60%                       ││
│ │    NPCs: 2 (Ranger, Druid)                              ││
│ │    Anomalies: 0                                         ││
│ │                                                         ││
│ │ ⛰️ Mount Spire           🔴 Very High ⛰️ Mountain       ││
│ │    Resources: Stone 70%, Ore 40%                        ││
│ │    NPCs: 1 (Dragon)                                     ││
│ │    Anomalies: 2 (Mana Storm, Floating Rocks)            ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Location Details ──────────────────────────────────────┐│
│ │ Castle Forest                                          ││
│ │                                                         ││
│ │ A crumbling castle deep in the ancient forest.          ││
│ │ The walls are overgrown with vines, and the             ││
│ │ towers are home to nesting eagles.                      ││
│ │                                                         ││
│ │ ⚠️ Danger Level: High (80/100)                          ││
│ │ 🌲 Environment: Forest                                  ││
│ │ 🕐 Last Visited: Day 32, 10:15                          ││
│ │                                                         ││
│ │ Connected Locations:                                    ││
│ │   → Darkwood (2h travel)                                ││
│ │   → Village of Mist (4h travel)                         ││
│ │                                                         ││
│ │ [Travel Here]  [Explore]  [Edit]  [Delete]              ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Travel Interface Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Travel: Castle Forest → Village of Mist                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─ Route ──────────────────────────────────────────────────┐│
│ │ 🏰 Castle Forest ─── 🌲 Darkwood ─── 🏘️ Village of Mist││
│ │                    │                │                     ││
│ │                    ▼                ▼                     ││
│ │              2h travel        2h travel                  ││
│ │              🌲 Forest        🌲 Forest                  ││
│ │              ⚠️ Wolves         🟢 Safe                   ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Travel Mode ────────────────────────────────────────────┐│
│ │ 🚶 Walk (4h total)  🐎 Ride (2h total)  ✨ Teleport (0.5h)││
│ │ Requirements: None     Requirements: Horse   Requirements: Mana 50││
│ │ Cost: None             Cost: Gold 10        Cost: Mana 50││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Hazards ────────────────────────────────────────────────┐│
│ │ ⚠️ Wolf Pack (30% chance) — Difficulty: Medium           ││
│ │ 💧 River Crossing (100% chance) — Cost: 30min            ││
│ │ 🌲 Dense Forest (100% chance) — Speed: -20%              ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Resources ──────────────────────────────────────────────┐│
│ │ 🌲 Wood: +15%  🌿 Herbs: +10%  🪨 Stone: +5%           ││
│ │ Gathering possible during travel                         ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│                          [Cancel]  [Start Travel]           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Travel Progress Display

```
┌─────────────────────────────────────────────────────────────┐
│ Traveling: Castle Forest → Village of Mist                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─ Progress ───────────────────────────────────────────────┐│
│ │ ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░ 60%          ││
│ │ Time Elapsed: 2h 24min                                   ││
│ │ Time Remaining: 1h 36min                                 ││
│ │ Distance: 12/20 km                                       ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Current Location ───────────────────────────────────────┐│
│ │ 🌲 Darkwood — Rest Stop                                  ││
│ │ You are in the heart of the Darkwood forest.             ││
│ │ The trees tower above you, blocking out the sun.         ││
│ │                                                         ││
│ │ Available Actions:                                       ││
│ │ [Rest] [Gather Resources] [Scout Ahead] [Continue]      ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Events ─────────────────────────────────────────────────┐│
│ │ ⚔️ Wolf Pack Encounter! (30% chance triggered)           ││
│ │ You hear howling in the distance. Wolves are nearby!     ││
│ │                                                         ││
│ │ [Fight] [Hide] [Distract] [Continue Traveling]          ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

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
| TASK-location-explorer.md | P0       | ⬜ Not Started |
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
