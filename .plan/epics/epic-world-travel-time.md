<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: World Travel & Time

**Overview:** (see sections below)


**Status:** In Progress
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** world, travel, time, weather, location
**Parent Epic:** World & Locations (epic-world-locations.md)

## Summary

World conditions, weather/time/season systems, travel mechanics, and random location generation for loop-lore.

## Sub-Epic of

Part of the **World & Locations** mega-epic. See parent epic for full scope and slicing rationale.

## Scope

- World data model (shared core, implemented here first)
- World conditions (weather, time of day, season)
- Travel mechanics (movement between locations)
- Random location generation
- Environmental modifiers for combat and exploration

## Key Integrations

- Battle System: weather/terrain combat modifiers
- NPC System: NPC behavior affected by conditions
- Exploration: random encounters based on location/weather
- Faction System: weather affects faction territories

## Tasks

- [x] Design world data model (worlds/world_states/world_timeline tables)
- [ ] Implement world conditions system
- [ ] Implement world style system
- [ ] Implement random location generation
- [x] Implement distance calculation system
- [x] Implement travel time estimation
- [x] Implement travel mechanics (walking shipped; riding/flying/teleportation still open)
- [ ] Implement travel hazards and encounters
- [ ] Implement fast travel unlock system
- [ ] Implement travel resource consumption
- [x] Implement time tracking system (story TimeAdvancement handlers advance location_states.time_of_day)
- [ ] Implement quest-based time progression
- [ ] Implement message-based time progression (time attack)
- [ ] Implement transfer-based time progression
- [ ] Implement global objectives with time limits
- [ ] Implement day/night cycle effects
- [ ] Implement seasonal changes
- [ ] Implement time-limited quests/events
- [ ] Implement travel-based random encounters
- [ ] Implement time-limited locations
- [x] Create world management UI (worlds pages shipped)
- [x] Create location explorer UI (shipped — Alpine location-explorer)
- [ ] Create travel UI
- [ ] Create time tracking UI
- [ ] Write tests for world system

## Implemented (verified 2026-10-08)

- **Tables:** `travel_parties`, `world_travel_budget`, `npc_migrations` (migration 040); `travel_routes`, `travel_route_stops`, `location_discovery`, `world_event_log` (migration 041).
- **Modules:** `src/rpg/world-travel/` (`travel`, `budget`, `migration`, `walk`); `src/locations/travel-engine.ts` + `tree.ts`; `src/routes/worlds/fractal-travel-routes.ts` + `fractal-locations-routes.ts`.
- **Time tracking:** `location_states.time_of_day` advanced by story TimeAdvancement handlers (`src/story/events/application/handlers.ts:139-151`).
- **Weather:** narrative column on world/location state plus battle-only `CombatWeather`; no standalone weather engine yet.

## Design

### Time Tracking System

```typescript
interface WorldTimeTracking {
  mode: "quest_execution" | "message_count" | "transfers_only" | "real_time";
  currentTime: WorldTime;
  timeScale: number; // 1 real second = X world minutes
  questTimeTracking: QuestTimeTracking;
  messageTimeTracking: MessageTimeTracking;
  globalObjectives: GlobalObjective[];
}

interface WorldTime {
  day: number;
  hour: number;
  minute: number;
  season: Season;
  year: number;
}

interface QuestTimeTracking {
  mainQuestTime: number; // total time spent on main quests
  sideQuestTime: number; // total time spent on side quests
  activeQuestTime: number; // time on current quest
  questTimeLimits: Map<string, number>; // quest ID → time limit
}

interface MessageTimeTracking {
  messagesPerTimeUnit: number; // messages = time progression
  transferTimeOnly: boolean; // only count transfers
  timeAttackMode: boolean; // time attack mode
  messageThreshold: number; // messages before time advances
}

interface GlobalObjective {
  id: string;
  name: string;
  description: string;
  timeLimit?: number; // world time seconds
  progress: number; // 0-100
  completed: boolean;
  consequences: ObjectiveConsequence[];
}
```

### Travel System

```typescript
interface TravelSystem {
  distanceMatrix: DistanceMatrix;
  travelModes: TravelMode[];
  fastTravel: FastTravelSystem;
  travelHazards: TravelHazard[];
  travelResources: TravelResource[];
}

interface DistanceMatrix {
  // Location A → Location B → distance in world units
  distances: Map<string, Map<string, number>>;
  // Travel time calculation
  calculateTravelTime(from: string, to: string, mode: TravelMode,): number;
}

interface TravelMode {
  id: string;
  name: string;
  speed: number; // world units per hour
  requirements: TravelRequirement[];
  hazards: string[]; // hazard IDs
  resourceCost: TravelResourceCost;
}

interface FastTravelSystem {
  unlockedLocations: string[]; // location IDs
  unlockRequirements: Map<string, UnlockRequirement>;
  travelCost: Map<string, number>; // location ID → cost
  cooldown: Map<string, number>; // location ID → cooldown seconds
}

interface TravelHazard {
  id: string;
  name: string;
  type: "environmental" | "enemy" | "obstacle" | "event";
  chance: number; // 0-1
  effect: HazardEffect;
  avoidance: AvoidanceMethod;
}

interface TravelResource {
  id: string;
  name: string;
  type: "food" | "water" | "stamina" | "fuel" | "money";
  consumptionRate: number; // per world unit traveled
  replenishMethod: string;
}
```

```typescript
interface TravelEncounter extends RandomEncounter {
  travelPhase: "departure" | "journey" | "arrival";
  distanceTrigger: number; // world units traveled
  locationProximity: string; // near which location
  travelRisk: number; // 0-100
}
```

## Dependencies

- **Parent hub:** `epic-world-locations.md` — owns the shared World/Location core data model.
- **Sibling order:** first in sequencing (core infrastructure); `epic-world-npcs.md` depends on this for placement, `epic-world-encounters.md` reuses travel-based encounter triggers.
- **Extension:** `epic-worlds-extension.md` — `src/worlds/timescale.ts` (createTimescaleService) advances the world clock; `epic-world-management-ui.md` owns the travel UI and time/weather widgets that surface this epic's outputs.
- **Divine:** `epic-world-shaping-divine.md` — world-shaping actions (raise mountains, summon storms) can mutate world conditions that this epic tracks.

## Open Questions

- Default time-tracking mode (real-time vs accelerated)
- How do world conditions persist between sessions?
- Seasonal cycle length and reset logic
