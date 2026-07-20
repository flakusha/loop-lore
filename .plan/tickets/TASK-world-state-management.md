# TASK: World State Management

**Epic:** World & Locations
**Priority:** High
**Effort:** Large
**Status:** Not Started

## Summary

Implement state management for world system with mode transitions between world states (exploration, settlement, wilderness, dungeon, special) and integration with other gameplay modes (battle, trading, quests).

## Core Features

### World States
- **Exploration**: Moving between locations
- **Settlement**: In town/city/village
- **Wilderness**: In wild areas
- **Dungeon**: In dungeon/cave/building
- **Special**: In special locations (boss rooms, treasure rooms, etc.)

### World Mode Transitions
- Exploration → Settlement (entering town)
- Settlement → Exploration (leaving town)
- Exploration → Wilderness (entering wild area)
- Wilderness → Exploration (leaving wild area)
- Exploration → Dungeon (entering dungeon)
- Dungeon → Exploration (leaving dungeon)
- Any → Special (entering special location)
- Special → Any (leaving special location)

### Integration Modes
- World + Battle (combat in world)
- World + Trading (trading in settlements)
- World + Quests (quest objectives in world)
- World + NPCs (NPC interactions)
- World + Items (item discovery/interaction)

## Design

```typescript
interface WorldStateManager {
  // World state management
  getWorldState(locationId: string): Promise<WorldState>;
  setWorldState(locationId: string, state: WorldState): Promise<void>;
  updateWorldState(locationId: string, updates: Partial<WorldState>): Promise<void>;
  
  // World mode transitions
  transitionWorld(locationId: string, from: WorldState, to: WorldState): Promise<TransitionResult>;
  canTransition(locationId: string, from: WorldState, to: WorldState): boolean;
  getAvailableTransitions(locationId: string): WorldTransition[];
  
  // World integration
  startWorldBattle(locationId: string, battleId: string): Promise<void>;
  endWorldBattle(locationId: string, battleId: string): Promise<void>;
  startWorldTrade(locationId: string, tradeId: string): Promise<void>;
  endWorldTrade(locationId: string, tradeId: string): Promise<void>;
  startWorldQuest(locationId: string, questId: string): Promise<void>;
  endWorldQuest(locationId: string, questId: string): Promise<void>;
  
  // World persistence
  saveWorldState(locationId: string): Promise<void>;
  loadWorldState(locationId: string): Promise<WorldState>;
  clearWorldState(locationId: string): Promise<void>;
}

interface WorldState {
  id: string;
  locationId: string;
  type: WorldType;
  status: WorldStatus;
  environment: WorldEnvironment;
  npcs: WorldNPC[];
  items: WorldItem[];
  events: WorldEvent[];
  discoveredAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
}

type WorldType = 'exploration' | 'settlement' | 'wilderness' | 'dungeon' | 'special';
type WorldStatus = 'active' | 'inactive' | 'discovered' | 'undiscovered' | 'locked' | 'unlocked';

interface WorldEnvironment {
  terrain: string;
  weather: string;
  timeOfDay: string;
  lighting: string;
  temperature: string;
  hazards: string[];
  resources: string[];
}

interface WorldNPC {
  id: string;
  name: string;
  type: string;
  status: 'idle' | 'hostile' | 'friendly' | 'neutral';
  location: string;
  dialogue: string;
  inventory: string[];
}

interface WorldItem {
  id: string;
  name: string;
  type: string;
  status: 'available' | 'taken' | 'hidden' | 'locked';
  location: string;
  quantity: number;
  condition: string;
}

interface WorldEvent {
  id: string;
  name: string;
  type: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  trigger: string;
  effects: string[];
  duration: number;
}

interface WorldTransition {
  from: WorldType;
  to: WorldType;
  conditions: TransitionCondition[];
  effects: TransitionEffect[];
  reversible: boolean;
}

interface TransitionResult {
  success: boolean;
  from: WorldType;
  to: WorldType;
  duration: number;
  effects: TransitionEffect[];
  errors: string[];
}
```

## Tasks

- [ ] Design world state management architecture
- [ ] Implement world state machine
- [ ] Implement world state transitions
- [ ] Implement world mode integration (battle, trading, quests)
- [ ] Implement world state persistence
- [ ] Implement world environment management
- [ ] Implement world NPC management
- [ ] Implement world item management
- [ ] Implement world event management
- [ ] Implement world validation
- [ ] Implement world error handling
- [ ] Write tests for world state management

## Files

- `src/world/state.ts` — world state management
- `src/world/transitions.ts` — world transitions
- `src/world/integration.ts` — world integration
- `src/world/persistence.ts` — world persistence
- `src/world/environment.ts` — world environment
- `src/world/npcs.ts` — world NPCs
- `src/world/items.ts` — world items
- `src/world/events.ts` — world events
