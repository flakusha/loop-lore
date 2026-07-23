# EPIC: Battle & Action Systems

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Very High
**Issue:** `baa672b`
**Type:** Feature Epic

## Summary

Battle UI, battle mechanics (turn-based, scripted, LLM-involved), utilities for battle mechanics, similar mechanics for trading/inventory/items/spells/actions, skill rolls/checks, and dynamic backgrounds.

## Core Features

### Battle UI

- Reduced chat message size for battle
- Minimal inter-actor communications
- Battle-specific message formatting
- Battle state display (health, mana, status effects)
- Turn order display
- Action selection UI
- Battle log/history

### Battle Mechanics

#### Turn-Based System

- Initiative calculation
- Turn order management
- Action points per turn
- Turn time limits (optional)

#### Battle Modes

- **Fully Scripted**: Pre-defined battle logic, no LLM involvement
- **Half-LLM Involved**: LGM generates narrative, mechanics are scripted
- **Full LLM**: LLM controls all aspects (narrative, mechanics, NPC decisions)

#### Battle Actions

- Attack (melee, ranged, magic)
- Defend (block, dodge, parry)
- Use item (potion, scroll, etc.)
- Cast spell (offensive, defensive, utility)
- Special ability (class-specific)
- Flee (escape battle)
- Negotiate (diplomatic solution)

#### Battle State

- Character health/mana/stamina
- Status effects (buffs/debuffs)
- Positioning (front/back/flank)
- Environmental effects
- Battle modifiers

### Battle Utilities

- Dice roller integration
- Stat calculator
- Damage calculator
- Initiative tracker
- Status effect manager
- Battle log generator
- Battle replay system

## Similar Mechanics

### Trading System

- NPC trading interface
- Buy/sell mechanics
- Price negotiation (LLM-driven)
- Trade offers and counter-offers
- Trade history
- Market dynamics (supply/demand)

### Inventory Management

- Inventory grid/list view
- Item organization (sort, filter, search)
- Item comparison
- Bulk operations (sell all, trash all)
- Inventory expansion
- Weight/encumbrance system

### Items Transfer

- Player-to-player trading
- Item dropping/picking up
- Item gifting
- Mail system for items
- Auction house (far-fetched)
- Item lending

### Spells & Actions

- Spell system (learn, cast, upgrade)
- Action system (skills, abilities)
- Cooldown management
- Mana/resource cost
- Spell/action effects
- Spell/action combinations

### Skill Rolls & Checks

- Skill check mechanics (d20, d100, custom)
- Difficulty classes (DC)
- Skill modifiers
- Critical success/failure
- Skill check UI (dice roll animation)
- Skill check history

## Far-Fetched Features

### Dynamic Backgrounds

- Scene-based background generation
- Character placement in scene
- Movement and progress visualization
- Environmental effects (weather, time of day)
- Background transitions
- Interactive background elements

### Scene Visualization

- Top-down or isometric view
- Character sprites/avatars
- Movement animations
- Action animations
- Environmental interactions
- Camera controls

## Design

### Battle System

```typescript
interface Battle {
  id: string;
  type: "pve" | "pvp" | "hybrid";
  mode: "scripted" | "half_llm" | "full_llm";
  state: BattleState;
  participants: BattleParticipant[];
  turnOrder: string[]; // participant IDs
  currentTurn: number;
  turnTimeLimit?: number; // seconds
  environment: BattleEnvironment;
  log: BattleLogEntry[];
}

interface BattleState {
  phase: "setup" | "active" | "paused" | "completed" | "fled";
  round: number;
  startTime: Date;
  endTime?: Date;
  winner?: string; // participant ID or team
}

interface BattleParticipant {
  id: string;
  type: "player" | "npc" | "monster";
  team: string;
  stats: BattleStats;
  position: BattlePosition;
  statusEffects: StatusEffect[];
  actions: BattleAction[];
  ai?: BattleAI; // for NPC/monster
}

interface BattleStats {
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  stamina: number;
  maxStamina: number;
  attack: number;
  defense: number;
  speed: number;
  criticalChance: number;
  dodgeChance: number;
}

interface BattlePosition {
  x: number;
  y: number;
  zone: "front" | "back" | "flank" | "center";
  facing: "north" | "south" | "east" | "west";
}

interface BattleAction {
  id: string;
  name: string;
  type: "attack" | "defend" | "item" | "spell" | "ability" | "flee" | "negotiate";
  cost: ActionCost;
  effects: ActionEffect[];
  requirements: ActionRequirement[];
  cooldown: number; // turns
  currentCooldown: number;
}

interface ActionCost {
  mana?: number;
  stamina?: number;
  items?: string[]; // item IDs
  actionPoints?: number;
}

interface ActionEffect {
  type: "damage" | "heal" | "buff" | "debuff" | "status" | "movement" | "special";
  target: "self" | "single" | "area" | "all_enemies" | "all_allies";
  value: number;
  duration?: number; // turns
  condition?: string;
}
```

### Battle Modes

```typescript
interface BattleMode {
  type: "scripted" | "half_llm" | "full_llm";
  llmInvolvement: LLMInvolvement;
  narrativeGeneration: boolean;
  npcDecisionMaking: boolean;
  mechanicCalculation: "scripted" | "llm" | "hybrid";
}

interface LLMInvolvement {
  narrative: boolean; // LGM generates battle narrative
  npcDecisions: boolean; // LLM decides NPC actions
  mechanicCalculation: boolean; // LLM calculates mechanics
  creativeEvents: boolean; // LLM generates unexpected events
}
```

### Trading System

```typescript
interface Trade {
  id: string;
  type: "npc" | "player" | "auction";
  participants: TradeParticipant[];
  offers: TradeOffer[];
  status: "pending" | "active" | "completed" | "cancelled";
  history: TradeHistoryEntry[];
}

interface TradeParticipant {
  id: string;
  type: "player" | "npc";
  inventory: string[]; // item IDs
  currency: number;
  reputation: number; // affects prices
}

interface TradeOffer {
  id: string;
  from: string; // participant ID
  items: TradeItem[];
  currency: number;
  conditions: string[];
  status: "pending" | "accepted" | "rejected" | "countered";
}

interface TradeItem {
  itemId: string;
  quantity: number;
  price: number;
  quality: string;
}

interface MarketDynamics {
  supply: Map<string, number>; // item ID → supply
  demand: Map<string, number>; // item ID → demand
  priceModifiers: Map<string, number>; // item ID → price modifier
  trends: MarketTrend[];
}
```

### Skill Check System

```typescript
interface SkillCheck {
  id: string;
  skill: string;
  difficulty: number; // DC
  modifiers: SkillModifier[];
  roll: DiceRoll;
  result: SkillCheckResult;
  consequences: SkillCheckConsequence[];
}

interface SkillModifier {
  source: string; // 'stat', 'item', 'buff', 'situation'
  value: number;
  type: "bonus" | "penalty";
}

interface DiceRoll {
  type: "d4" | "d6" | "d8" | "d10" | "d12" | "d20" | "d100" | "custom";
  count: number;
  results: number[];
  total: number;
  critical: boolean; // natural 20 or 1
}

interface SkillCheckResult {
  success: boolean;
  margin: number; // how much over/under DC
  critical: boolean;
  narrative: string; // LGM-generated description
}

interface SkillCheckConsequence {
  type: "success" | "failure" | "partial" | "critical_success" | "critical_failure";
  effect: string;
  duration?: number;
  reversible: boolean;
}
```

### Dynamic Background System

```typescript
interface DynamicBackground {
  id: string;
  scene: Scene;
  characters: CharacterPlacement[];
  environment: EnvironmentState;
  transitions: BackgroundTransition[];
  interactive: boolean;
}

interface Scene {
  type: "dungeon" | "town" | "wilderness" | "dungeon" | "special";
  subType: string;
  mood: "peaceful" | "tense" | "dangerous" | "mysterious";
  timeOfDay: "dawn" | "day" | "dusk" | "night";
  weather: "clear" | "cloudy" | "rain" | "snow" | "fog";
}

interface CharacterPlacement {
  characterId: string;
  position: { x: number; y: number };
  animation: "idle" | "walking" | "running" | "fighting" | "talking";
  facing: "north" | "south" | "east" | "west";
}

interface EnvironmentState {
  lighting: number; // 0-100
  particles: string[]; // 'rain', 'snow', 'dust', 'fireflies'
  sounds: string[]; // ambient sounds
  effects: string[]; // 'fog', 'haze', 'glow'
}

interface BackgroundTransition {
  from: string; // scene ID
  to: string; // scene ID
  trigger: "movement" | "time" | "event" | "manual";
  animation: "fade" | "slide" | "zoom" | "dissolve";
  duration: number; // seconds
}
```

## Tasks

- [ ] Design battle system architecture
- [ ] Implement battle UI (reduced message size)
- [ ] Implement turn-based battle mechanics
- [ ] Implement scripted battle mode
- [ ] Implement half-LLM battle mode
- [ ] Implement full-LLM battle mode
- [ ] Implement battle utilities (dice roller, stat calculator, etc.)
- [ ] Implement trading system
- [ ] Implement inventory management UI
- [ ] Implement items transfer system
- [ ] Implement spells & actions system
- [ ] Implement skill rolls & checks
- [ ] Implement dynamic backgrounds (far-fetched)
- [ ] Implement scene visualization (far-fetched)
- [ ] Create battle UI components
- [ ] Create trading UI components
- [ ] Create inventory UI components
- [ ] Create spell/action UI components
- [ ] Create skill check UI components
- [ ] Write tests for battle system

## Files

- `src/battle/` — battle system (does not exist yet)
- `src/battle/battle.ts` — battle management
- `src/battle/modes.ts` — battle modes (scripted/half-llm/full-llm)
- `src/battle/actions.ts` — battle actions
- `src/battle/utilities.ts` — battle utilities
- `src/trading/` — trading system (does not exist yet)
- `src/trading/trade.ts` — trade management
- `src/trading/market.ts` — market dynamics
- `src/inventory/` — inventory system (expand existing)
- `src/spells/` — spells & actions (does not exist yet)
- `src/skills/` — skill checks (does not exist yet)
- `src/backgrounds/` — dynamic backgrounds (does not exist yet)
- `src/db/schema-battle.ts` — battle tables
- `src/routes/battle.ts` — battle API
- `src/frontend/battle/` — battle UI
- `src/frontend/trading/` — trading UI
- `src/frontend/inventory/` — inventory UI
- `src/frontend/backgrounds/` — background UI

## Open Questions

### Battle System

- How many participants per battle is reasonable?
- Should battles be real-time or turn-based?
- How to handle battle disconnections?
- Should battles be instanced or world-based?
- How to balance LLM involvement vs. scripted mechanics?

### State Switching & Mode Transitions

- How to handle smooth transitions between gameplay modes?
- Should mode switches be explicit or implicit?
- How to maintain immersion during mode changes?
- Should mode transitions have animations/effects?
- How to handle partial mode transitions (e.g., trading during battle)?

### Trading System

- How to handle NPC trading prices?
- Should player-to-player trading be secure?
- How to prevent trade scams?
- Should there be a global market/auction house?

### Inventory Management

- How many inventory slots is reasonable?
- Should inventory have weight limits?
- How to handle inventory overflow?
- Should inventory be sortable/filterable?

### Skill Checks

- How to display dice rolls to players?
- Should critical success/failure be visible?
- How to handle multiple skill checks in sequence?
- Should skill checks be automatic or player-triggered?

### Dynamic Backgrounds

- How to generate backgrounds procedurally?
- Should backgrounds be interactive?
- How to handle background transitions?
- Should backgrounds affect gameplay?

## Implementation Phases

### Phase 1: Battle Core

- Battle data model
- Turn-based mechanics
- Battle UI (reduced messages)
- Basic battle actions

### Phase 2: Battle Modes

- Scripted battle mode
- Half-LLM battle mode
- Full-LLM battle mode
- Battle utilities

### Phase 3: Trading & Inventory

- Trading system
- Inventory management UI
- Items transfer
- Market dynamics

### Phase 4: Spells & Skills

- Spells & actions system
- Skill rolls & checks
- Skill check UI
- Spell/action combinations

### Phase 5: Dynamic Backgrounds (Far-Fetched)

- Scene generation
- Character placement
- Background transitions
- Interactive elements

### Phase 6: Polish & Integration

- UI/UX refinement
- Performance optimization
- Balance tuning
- Documentation

## Related Epics

- **Epic Platform Research** — combat / trading / skill-check adoption tracked there.
- **Epic RPG Mechanics** — combat, loot, inventory, skills shared; this epic owns battle UI/flow, RPG owns the mechanics.
- **Epic World & Locations** — encounters, monsters, and location-based random encounters overlap; world owns location data.

## Linked Tasks

- TASK-battle-action-systems.md
