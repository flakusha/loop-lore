<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: NPC & Social UI

**Status:** 🟢 Implemented (mock data, UI shell)
**Priority:** P2 — Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** npc, social, relationships, ui, frontend
**Branch:** `npc-management-ui`

## Summary

Complete NPC management interface including NPC viewer, relationship map, faction relations, karma/standing display, and social interaction UI.

## Core Features

### NPC Viewer

- NPC list with search/filter
- NPC details panel
- NPC stats and abilities
- NPC inventory
- NPC schedule

### Relationship Map

- Visual relationship graph
- Relationship types (friend, rival, enemy, ally)
- Relationship strength
- Relationship history

### Faction Relations

- Faction list
- Faction standing display
- Faction reputation
- Faction quests

### Karma/Standing Display

- Karma meter
- Standing tiers
- Reputation modifiers
- Title display

### Social Interaction

- Dialogue options
- Persuasion/intimidation checks
- Gift giving
- Trade initiation

## UI Components

### NPC Viewer Layout

```
┌─────────────────────────────────────────────────────────────┐
│ NPCs: The Forgotten Realms         [Search] [Filter: All]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─ NPC List ───────────────────────────────────────────────┐│
│ │ 👤 Merchant (Friendly)                                   ││
│ │ 👤 Guard (Neutral)                                       ││
│ │ 👤 Blacksmith (Friendly)                                 ││
│ │ 👤 Healer (Honored)                                      ││
│ │ 👤 Quest Giver (Friendly)                                ││
│ │ 👤 Mysterious Stranger (Unknown)                         ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ NPC Details ────────────────────────────────────────────┐│
│ │ 👤 Merchant                                              ││
│ │ ─────────────────────────────────────────────────────── ││
│ │                                                          ││
│ │ Role: Merchant                                           ││
│ │ Location: Village Market                                 ││
│ │ Disposition: Friendly (+75)                              ││
│ │                                                          ││
│ │ Stats:                                                   ││
│ │   Persuasion: 15                                         ││
│ │   Intimidation: 5                                        ││
│ │   Commerce: 20                                           ││
│ │                                                          ││
│ │ Inventory:                                               ││
│ │   [Iron Sword] [Health Potion] [Mana Potion] [Shield]   ││
│ │                                                          ││
│ │ Schedule:                                                ││
│ │   06:00-18:00: Market (Trading)                          ││
│ │   18:00-22:00: Inn (Resting)                             ││
│ │   22:00-06:00: Home (Sleeping)                           ││
│ │                                                          ││
│ │ [Trade] [Talk] [Give Gift] [View Relationship]           ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Relationship Map

```
┌─ Relationship Map ─────────────────────────────────────────────┐
│                                                               │
│                        [Player]                                │
│                           │                                   │
│         ┌─────────────────┼─────────────────┐                 │
│         │                 │                 │                 │
│     [Merchant]        [Guard]         [Healer]                │
│     (Friendly)       (Neutral)       (Honored)                │
│         │                 │                 │                 │
│         │                 │                 │                 │
│     [Blacksmith]     [Guard Captain]  [Priest]                │
│     (Friendly)       (Friendly)       (Revered)               │
│                                                               │
│ Legend:                                                       │
│   ─── Friendly (Green)                                       │
│   ─── Neutral (Gray)                                         │
│   ─── Hostile (Red)                                          │
│   ─── Allied (Blue)                                          │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Faction Relations Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Factions: The Forgotten Realms                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─ Faction List ───────────────────────────────────────────┐│
│ │ 🏰 Merchants Guild    Standing: Honored (+75)            ││
│ │ ⚔️ City Guard         Standing: Friendly (+50)           ││
│ │ 🏛️ Temple of Light    Standing: Revered (+90)            ││
│ │ 🌲 Forest Rangers     Standing: Neutral (0)              ││
│ │ 💀 Thieves Guild      Standing: Hostile (-50)            ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Faction Details ────────────────────────────────────────┐│
│ │ 🏰 Merchants Guild                                       ││
│ │ ─────────────────────────────────────────────────────── ││
│ │                                                          ││
│ │ Description: A powerful guild of traders and merchants.  ││
│ │                                                          ││
│ │ Standing: Honored (+75)                                  ││
│ │ Tier: Honored (75-90)                                    ││
│ │                                                          ││
│ │ Benefits:                                                ││
│ │   - 10% discount at all merchants                        ││
│ │   - Access to rare items                                 ││
│ │   - Priority trading                                     ││
│ │                                                          ││
│ │ Quests:                                                  ││
│ │   - [ ] Deliver supplies to remote village               ││
│ │   - [ ] Investigate competitor                           ││
│ │                                                          ││
│ │ Members:                                                 ││
│ │   - Merchant (Leader)                                    ││
│ │   - Trader (Member)                                      ││
│ │   - Guard (Associate)                                    ││
│ │                                                          ││
│ │ [View Quests] [View Members] [Improve Standing]          ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Karma Display

```
┌─ Karma & Standing ─────────────────────────────────────────────┐
│                                                               │
│ Overall Karma: +45 (Good)                                     │
│ [██████████████████░░░░░░░░░░░░] 45/100                       │
│                                                               │
│ Categories:                                                   │
│   Compassion: +60 (Heroic)                                   │
│   Justice: +30 (Fair)                                         │
│   Honor: +50 (Noble)                                         │
│   Courage: +40 (Brave)                                        │
│                                                               │
│ Titles:                                                       │
│   - Hero of the Village                                       │
│   - Friend of the Forest                                      │
│                                                               │
│ Standing Tiers:                                               │
│   Exalted (90-100): Temple of Light                           │
│   Revered (75-89): Merchants Guild                            │
│   Honored (60-74): City Guard                                 │
│   Friendly (40-59): Forest Rangers                            │
│   Neutral (-39 to 39):                                        │
│   Unfriendly (-59 to -40): Thieves Guild                      │
│   Hostile (-75 to -60):                                       │
│   Hated (-100 to -76):                                        │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

## Integration Points

### Backend Dependencies

| Backend System      | What It Provides       | How Used              |
| ------------------- | ---------------------- | --------------------- |
| NPC System          | NPC CRUD, behavior     | Display NPCs          |
| Relationship System | Relationship CRUD      | Display relationships |
| Faction System      | Faction CRUD, standing | Display factions      |
| Karma System        | Karma CRUD, titles     | Display karma         |
| Social System       | Social interactions    | Display interactions  |

### Shared Components

| Component         | Used By            | Notes                         |
| ----------------- | ------------------ | ----------------------------- |
| NPC card          | NPC, Battle, World | Reusable NPC display          |
| Relationship line | NPC, Faction       | Reusable relationship display |
| Standing meter    | Faction, Karma     | Reusable standing display     |

## Acceptance Criteria

- [ ] NPC list with search/filter
- [ ] NPC details panel
- [ ] NPC stats and abilities
- [ ] NPC inventory display
- [ ] NPC schedule display
- [ ] Relationship map visualization
- [ ] Relationship types and strength
- [ ] Faction list
- [ ] Faction standing display
- [ ] Faction benefits
- [ ] Karma meter
- [ ] Standing tiers
- [ ] Title display
- [ ] Social interaction options
- [ ] Mobile responsive
- [ ] Keyboard accessible
- [ ] Screen reader support

## Implementation Phases

### Phase 1: NPC Viewer

- NPC list
- NPC details
- NPC schedule

### Phase 2: Relationships

- Relationship map
- Relationship types
- Relationship history

### Phase 3: Factions

- Faction list
- Faction standing
- Faction benefits

### Phase 4: Karma

- Karma meter
- Standing tiers
- Title display

### Phase 5: Polish

- Mobile responsive
- Keyboard accessible
- Screen reader support

## Tasks

| Task                      | Priority | Status         |
| ------------------------- | -------- | -------------- |
| TASK-npc-viewer-list-details-schedule.md        | P0       | ✅ Done        |
| TASK-relationship-map-visual-graph.md           | P0       | ✅ Done        |
| TASK-faction-relations-list-and-standing.md     | P0       | ✅ Done        |
| TASK-karma-display-meter-and-tiers.md           | P0       | ✅ Done        |
| TASK-npc-alpine-component-wire-into-app.md      | P0       | ✅ Done        |

## Files Created

- `src/frontend/alpine/chat-types/npc.ts` — NPC types (NpcData, NpcFaction, NpcKarma, etc.)
- `src/frontend/alpine/chat-types/npc-state.ts` — ChatNpcState interface
- `src/frontend/alpine/npc.ts` — Alpine.js NPC management component with mock data
- `src/views/world-edit.html` — Added NPCs tab with sub-tab navigation

## Related Epics

- **Epic NPC/Actor System** — Backend NPC system
- **Epic Relationships** — Backend relationship system
- **Epic Faction Reputation** — Backend faction system
- **Epic World & Locations** — Backend world system
- `epic-wardrobe-avatar-variants.md` — NPC viewer detail panel needs an "outfit/loadout" tab; schedule view should reference outfit binding rules (time-of-day → outfit)
