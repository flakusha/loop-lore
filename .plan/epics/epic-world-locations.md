<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: World & Locations

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Very High total (split across 4 sub-epics: travel-time High, npcs High, encounters High, diplomacy-karma High)
**Issue:** `136d857`
**Type:** Feature Epic

## Summary

World and location system hub — overall conditions, lore following/quality investigation on creation, overall style (fantasy, real, cyberpunk, sci-fi, etc.), random location generation, anomalies/effects, item search/generation, unique places, resource extraction, persistent storage, NPC placement/migration/inventories.

> **⚠️ This epic is a hub.** All implementation tasks and per-subsystem design blocks have moved into the 4 sub-epics. Each sub-epic delivers independently shippable value; this file retains only the shared core data model, sequencing, files, and open questions.

## Sub-Epics

| Sub-Epic                   | Epic File                       | Scope                                                                     | Priority |
| -------------------------- | ------------------------------- | ------------------------------------------------------------------------- | -------- |
| **Travel & Time**          | `epic-world-travel-time.md`     | World conditions, weather/time/season, travel, random location generation | High     |
| **NPCs & Memories**        | `epic-world-npcs.md`            | NPC placement/migration/inventories, NPC memory system                    | High     |
| **Encounters & Resources** | `epic-world-encounters.md`      | Anomalies, resource extraction, item search/generation, unique places     | Medium   |
| **Diplomacy & Karma**      | `epic-world-diplomacy-karma.md` | Factions, reputation/karma, lore-following/quality, world state           | Medium   |

## Sequencing

1. **Travel & Time first** — lowest coupling; core infrastructure (world data model, conditions, locations) that other subs depend on.
2. **NPCs & Memories second** — medium coupling; depends on Travel & Time for NPC placement.
3. **Encounters & Resources parallel-safe** — independent of NPCs; can proceed alongside either.
4. **Diplomacy & Karma last** — highest coupling; depends on NPCs and reputation systems.

## Shared Core Data Model

Owned by this hub; consumed by all sub-epics. The **Travel & Time** sub-epic implements it first.

```typescript
interface World {
  id: string;
  name: string;
  style: WorldStyle;
  conditions: WorldConditions;
  lore: WorldLore;
  locations: Location[];
  npcs: NPC[];
  resources: Resource[];
  anomalies: Anomaly[];
  timeTracking: WorldTimeTracking;
  travelSystem: TravelSystem;
}

interface WorldStyle {
  type: "fantasy" | "real" | "cyberpunk" | "scifi" | "postapocalyptic" | "custom";
  substyle?: string;
  assetSet: string;
  npcBehaviorSet: string;
  itemPropertySet: string;
}

interface WorldConditions {
  weather: WeatherState;
  timeOfDay: TimeOfDay;
  season: Season;
  globalModifiers: Modifier[];
  history: WorldEvent[];
}
```

```typescript
interface Location {
  id: string;
  worldId: string;
  name: string;
  type: LocationType;
  style: LocationStyle;
  conditions: LocationConditions;
  anomalies: Anomaly[];
  items: LocationItem[];
  resources: LocationResource[];
  npcs: LocationNPC[];
  storage: PersistentStorage;
  discovered: boolean;
  unique: boolean;
  travelConnections: TravelConnection[];
  timeEvents: TimeEvent[];
}

interface TravelConnection {
  targetLocationId: string;
  distance: number; // world units
  travelModes: string[]; // travel mode IDs
  hazards: string[]; // hazard IDs
  discovered: boolean;
}

interface TimeEvent {
  id: string;
  name: string;
  trigger: TimeTrigger;
  effect: TimeEffect;
  recurring: boolean;
  interval?: number; // world time seconds
}

interface LocationType {
  category: "dungeon" | "town" | "wilderness" | "dungeon" | "special";
  subcategory: string;
  generation: "procedural" | "handcrafted" | "hybrid";
}

interface LocationConditions {
  dangerLevel: number; // 0-100
  explorationProgress: number; // 0-100
  resourcesRemaining: number; // 0-100
  npcPresence: number; // 0-100
  anomalyStrength: number; // 0-100
}
```

## Files

- `src/world/` — world system (does not exist yet)
- `src/world/world.ts` — world management
- `src/world/location.ts` — location system
- `src/world/anomaly.ts` — anomaly system
- `src/world/resources.ts` — resource system
- `src/world/storage.ts` — persistent storage
- `src/world/npc.ts` — NPC placement/migration
- `src/world/generation.ts` — procedural generation
- `src/db/schema-world.ts` — world tables
- `src/routes/world.ts` — world API
- `src/frontend/world/` — world UI components

## Open Questions

### World Generation

- How to balance procedural vs. handcrafted content?
- Should worlds be finite or infinite?
- How to handle world persistence across sessions?
- Should worlds be shareable between players?

### Location Generation

- How many locations per world is optimal?
- Should locations have prerequisites for discovery?
- How to handle location revisiting?
- Should locations change over time?

### Anomalies

- How many anomalies per location is reasonable?
- Should anomalies be visible or hidden?
- How to handle anomaly stacking?
- Should anomalies affect NPCs differently?

### Resources

- How to balance resource regeneration rates?
- Should resources be finite or infinite?
- How to handle resource competition between players?
- Should resources have quality tiers?

### NPCs

- How many NPCs per location is reasonable?
- Should NPCs have persistent inventories?
- How to handle NPC death?
- Should NPCs remember player interactions?

### Persistent Storage

- How much storage per location is reasonable?
- Should storage be accessible to all players?
- How to handle storage theft?
- Should storage have maintenance costs?

### Distance & Travel

- How to calculate distance between locations (Euclidean, Manhattan, graph-based)?
- Should travel time be real-time or accelerated?
- How to handle travel interruptions (combat, events)?
- Should fast travel have a cost or cooldown?
- How to balance travel speed vs. world size?

### Time Tracking

- What triggers time progression (quests, messages, transfers, real-time)?
- How to balance time scale (1 real second = X world minutes)?
- Should time tracking be visible to players or hidden?
- How to handle time-limited quests (failure conditions)?
- Should time affect NPC behavior and schedules?

### Game-Inspired Systems

- Which game systems are most applicable to loop-lore?
- How to adapt single-player mechanics for multiplayer/chat?
- Should game systems be optional or mandatory?
- How to balance complexity vs. accessibility?
- Should game systems be plugin-based or core?

### Random Encounters

- How often should random encounters occur?
- Should encounters be purely random or story-driven?
- How to balance encounter difficulty?
- Should encounters be visible or hidden?
- How to handle encounter avoidance?

### Monsters & Enemies

- How many monster types per world is reasonable?
- Should monsters have persistent territories?
- How to handle monster respawning?
- Should monsters drop loot based on difficulty?
- How to balance boss monsters?

### Diplomacy

- How many factions per world is reasonable?
- Should diplomacy be player-driven or automated?
- How to handle faction wars?
- Should diplomacy affect NPC behavior?
- How to balance diplomatic options?

### Karma & Standing

- How visible should karma be to players?
- Should karma affect NPC reactions?
- How to handle karma resets?
- Should standing be per-faction or global?
- How to balance karma effects?

### NPC Memories

- How many memories per NPC is reasonable?
- How fast should memories decay?
- Should NPCs share memories with each other?
- How to handle NPC emotional state changes?
- Should NPCs remember player actions across sessions?

### Message Formatting

- How to balance slang vs. readability?
- Should slang be world-specific or character-specific?
- How to handle language level changes?
- Should formatting be automatic or player-controlled?
- How to maintain character voice consistency?

### Travel Encounters

- How often should travel encounters occur?
- Should encounters be based on travel distance or time?
- How to handle encounter avoidance during travel?
- Should travel encounters be different from location encounters?
- How to balance travel risk vs. reward?

### Time-Limited Locations

- How long should temporary locations last?
- Should players be warned before location expiration?
- How to handle items/NPCs in expiring locations?
- Should locations be renewable?
- How to balance temporary vs. permanent locations?

### Global Cataclysms

- How often should cataclysms occur?
- Should cataclysms be predictable or random?
- How to handle cataclysm recovery?
- Should cataclysms have permanent effects?
- How to balance cataclysm severity?

### Global Memories & Cross-Group Impact

- How long should global memories persist?
- How to handle time lag between events and impact?
- Should cross-group impact be visible to players?
- How to balance reputation spillover?
- Should world state evolution be automatic or player-driven?
- How to handle conflicting actions from different groups?

## Related Epics

- **Epic Platform Research** — world style / style-specific asset & NPC generation are adoption candidates tracked there.
- **Epic RPG Mechanics** — world-level modifiers, factions, reputation/karma overlap; RPG owns the mechanics, this epic owns location/world data.
- **Epic Battle & Action Systems** — encounters, monsters, and location-based random encounters overlap; battle owns combat flow.
- **Epic 27 (Data Integrity & ACID)** — persistent world/location storage relies on `data_version` concurrency guards once enforced.

## Linked Tasks

- TASK-world-locations.md
- TASK-world-event-system.md
- TASK-random-encounters-events.md
