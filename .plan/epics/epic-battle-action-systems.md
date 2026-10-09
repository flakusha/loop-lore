<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Battle & Action Systems

**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** Partially shipped — combat core, battle integrations (items/social/npc/weather/resolution), loot pipeline, and a minimal battle UI panel are live (verified 2026-10-09); spells/skills, LLM battle modes, and trading UI remain open.
**Priority:** Medium
**Effort:** Very High (split into 5 sub-epics)
**Type:** Feature Epic
**Tags:** battle, combat, trading, inventory, spells, skills

## Summary

Battle UI, battle mechanics (turn-based, scripted, LLM-involved), utilities for battle mechanics, similar mechanics for trading/inventory/items/spells/actions, skill rolls/checks, and dynamic backgrounds.

> **⚠️ This epic is too large to ship in one pass.** It has been split into 5 sub-epics below. Each sub-epic delivers independently shippable value.
>
> **Wiring status (verified 2026-10-09):** `battleRoutes` is **mounted and alive** at `src/routes/v1/actors-surface.ts:90` (`.use(battleRoutes(handleOpts, prefix))`; the route barrel is `src/routes/battle/index.ts:30`). The old `src/elysia-app.ts:204` citation is stale — wiring moved into the versioned surface. Open work is the full gameplay sub-epics below (turn-based UI breadth, trading, spells).

## Implemented (verified 2026-10-09)

- **Tables:** `battles`, `dice_roll_history`, `loot_tables`, `loot_entries` (`src/db/schema-core.ts:881-931`, migration `src/db/migrations/001_init.ts:2792-2842`)
- **Modules:** `src/rpg/combat/` (actions, attacks, conditions, damage, initiative, saves); `src/battle/items-integration.ts` + `src/battle/item-mapping.ts` (equipment stats, durability, loot generation); `src/battle/social-integration/` (intimidate/taunt/rally/inspire/demoralize, surrender, morale); `src/battle/npc-integration/` (NPC decisions); `src/battle/weather-integration/` (modifiers, hazards, position); `src/battle/resolution-integration/`; `src/battle/integration-schemas/`
- **Routes:** `src/routes/battle/` — equipment (calculate/can-equip/durability/repair/loot/combat-use), social, npc, weather, resolution, morale endpoints (`src/routes/battle/index.ts:19`)
- **UI:** `src/frontend/battle/{panel,commands,render}.ts` (VN-style panel, keyboard nav), `src/frontend/alpine/chat-battle.ts` + `src/frontend/alpine/chat-actions/battle.ts` (chat dispatch via `/attack`, `/heal`, `/battle` slash commands)
- **Shipped:** turn-based combat loop, initiative, saves/conditions, damage, morale + surrender, equipment/durability, loot generation + persistence to `world_items`, unified dice resolution, environmental modifiers
- **Not shipped:** LLM battle modes (`half_llm`/`full_llm` mode selection — no such config found in `src/rpg/combat/`), spell casting actions, flee/negotiate panel buttons (surrender exists via API + social integration but is not on the panel action bar), dynamic backgrounds

## Current State

| Surface | Status | Where |
| --- | --- | --- |
| Turn-based combat (initiative, actions, damage, conditions) | Shipped | `src/rpg/combat/`, `src/routes/rpg/combat.ts` |
| Equipment / durability / loot pipeline | Shipped | `src/battle/items-integration.ts`, `src/routes/battle/equipment.ts:180` |
| Social combat (intimidate/taunt/surrender/morale) | Shipped | `src/battle/social-integration/`, `src/routes/battle/social.ts` |
| NPC decisions / morale | Shipped | `src/battle/npc-integration/`, `src/routes/battle/npc.ts` |
| Weather/terrain modifiers, hazards | Shipped | `src/battle/weather-integration/`, `src/routes/battle/weather.ts` |
| Unified resolution / dice | Shipped | `src/battle/resolution-integration/`, `src/routes/battle/resolution.ts` |
| Battle UI panel (attack/heal/end only) | Partial | `src/frontend/battle/panel.ts`, `src/frontend/battle/commands.ts:38` |
| LLM battle modes (scripted/half/full) | Not Started | — |
| Spells & actions system | Not Started | — |
| Trading UI / market dynamics | Not Started | see `./epic-economy-trading.md` |

## Unticketed Gaps

The battle panel action bar offers only Attack / Heal / End (`src/frontend/battle/commands.ts:38-41`) — no item-use, spell, flee, negotiate, or social-action buttons, even though the backing APIs exist (`src/routes/battle/social.ts`, `src/routes/battle/equipment.ts`). Wiring the panel to those surfaces is unticketed.

## Sub-Epics

| Sub-Epic                | Epic File                   | Scope                                                                   | Priority |
| ----------------------- | --------------------------- | ----------------------------------------------------------------------- | -------- |
| **Battle Core**         | `epic-battle-core.md`       | Turn-based mechanics, battle modes, actions, state management           | High     |
| **Battle UI**           | `epic-battle-ui.md`         | Reduced message size, state display, turn order, action selection       | High     |
| **Battle Utilities**    | `epic-battle-utilities.md`  | Dice roller, stat calculator, initiative tracker, status effect manager | Medium   |
| **Trading & Inventory** | `epic-trading-inventory.md` | Trading system, inventory management, items transfer, market dynamics   | Medium   |
| **Spells & Skills**     | `epic-spells-skills.md`     | Spell system, action system, cooldowns, skill rolls/checks              | Medium   |

## Splitting Rationale

The original epic mixed core battle mechanics with trading, inventory, spells, and far-fetched features (dynamic backgrounds). Splitting into focused sub-epics allows:

1. **Battle Core** — Ship the combat loop first; all other features build on this.
2. **Battle UI** — Can be implemented in parallel with Battle Core.
3. **Battle Utilities** — Reusable across all sub-epics.
4. **Trading & Inventory** — Independent of combat; shares economy spec with World/Locations.
5. **Spells & Skills** — Extends the RPG mechanics system; lower priority than core combat.

## Far-Fetched Features (Deferred)

The following features are moved to a separate deferred epic or removed from scope:

- Dynamic backgrounds (scene generation, character placement, movement visualization)
- Scene visualization (top-down/isometric view, sprites, animations)

These should be tracked separately in `epic-immersion-visuals.md` or deferred to a future version.

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

Implemented (verified 2026-10-09):
- `src/rpg/combat/` — combat core (actions, attacks, checks, dc, initiative)
- `src/battle/` — items-integration.ts, item-mapping.ts, social-integration/, npc-integration/, weather-integration/, resolution-integration/, integration-schemas/
- `src/routes/rpg/combat.ts` — combat API
- `src/routes/battle/` — equipment, equipment-durability, social, morale, npc, weather, resolution, log
- `src/routes/v1/actors-surface.ts:90` — `battleRoutes` mount
- `src/db/schema-core.ts:881-931` — `battles`, `dice_roll_history`, `loot_entries`, `loot_tables`
- `src/frontend/battle/` — panel.ts, commands.ts, render.ts
- `src/frontend/alpine/chat-battle.ts` + `src/frontend/alpine/chat-actions/battle.ts` — chat battle dispatch

Planned (do not exist yet):
- `src/battle/battle.ts`, `src/battle/modes.ts`, `src/battle/actions.ts`, `src/battle/utilities.ts` — battle management/modes/utilities (combat core shipped in `src/rpg/combat/` instead; LLM modes still absent)
- `src/trading/` (`trade.ts`, `market.ts`) — trading system (see `./epic-economy-trading.md`)
- `src/inventory/` — inventory management (see `./epic-inventory-ui.md`)
- `src/spells/` — spells & actions (see `./epic-magic-spell-systems.md`)
- `src/skills/` — skill checks (see `./epic-skills.md`)
- `src/backgrounds/` — dynamic backgrounds
- `src/db/schema-battle.ts` — battle tables live in `src/db/schema-core.ts:881-931` instead
- `src/routes/battle.ts` — battle API lives in `src/routes/battle/` instead
- `src/frontend/trading/`, `src/frontend/inventory/`, `src/frontend/backgrounds/` — future UIs

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

## Integration Points

### Systems This Epic Depends On

| System                | What It Provides                                   | How Used                                                  |
| --------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| RPG Mechanics         | Stats (STR, DEX, CON), dice resolution, XP rewards | Damage calculation, stat modifiers, level-up after combat |
| Magic & Spell Systems | Spell definitions, mana costs, elemental effects   | Spells as combat actions, spell damage/healing            |
| Item System           | Equipment stats, consumable effects                | Weapon damage, armor defense, potion healing              |
| Inventory System      | Item storage, equipped items                       | Loot drop pipeline, equipment loadout management          |
| Weather & Environment | Terrain modifiers, weather effects                 | Environmental combat modifiers, terrain cover bonuses     |
| Social Interaction    | Persuasion, intimidation, deception                | Negotiate action, morale breaks, surrender mechanics      |
| Resolution System     | Unified dice/action resolution                     | Skill checks, attack rolls, saving throws                 |

### Systems That Depend On This Epic

| System                 | What It Consumes               | How Used                                                                                                                                                                                                            |
| ---------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Companion, Pet & Mount | Battle participation rules     | Companions fight alongside players, pet combat                                                                                                                                                                      |
| Crime & Stealth        | Stealth attack mechanics       | Assassinate action, ambush from stealth                                                                                                                                                                             |
| Disease & Poison       | Poison application in combat   | Poisoned weapons, venomous creature attacks                                                                                                                                                                         |
| NPC/Actor System       | Enemy AI behavior              | NPC-driven combat decisions, morale, personality                                                                                                                                                                    |
| NSFW Game Mechanics    | Combat injuries, battle damage | Injury system, wound narratives                                                                                                                                                                                     |
| **Mini-Games Plugins** | Card-based combat mechanics    | `card-battle` plugin replaces attack/defend actions with card plays; `nsfw-cards` plugin provides seduction encounters that modify battle outcomes (e.g., charm/confuse enemy, reduce resistance, intimate victory) |

### Shared Data Contracts

| Contract         | Shared With                    | Purpose                                      |
| ---------------- | ------------------------------ | -------------------------------------------- |
| `StatusEffect`   | RPG, Magic, Disease, Social    | Shared buff/debuff model across all systems  |
| `DiceRoll`       | RPG, Resolution, Social, Crime | Unified dice resolution for all skill checks |
| `CharacterStats` | RPG, Character Core, Social    | STR/DEX/CON/etc. shared across all systems   |

### Cross-System Events

| Event                   | Direction                          | Purpose                                                 |
| ----------------------- | ---------------------------------- | ------------------------------------------------------- |
| `battle.victory`        | emits → XP, Loot, Economy          | Grants XP, generates loot drops, affects reputation     |
| `battle.defeat`         | emits → Companion, Disease, Social | Companion loyalty loss, injury/disease, reputation loss |
| `battle.poison_applied` | subscribes ← Disease               | Disease system applies poison effects during combat     |
| `weather.changed`       | subscribes ← Weather               | Environmental modifiers update mid-battle               |

---

## Related Epics

- `epic-platform-research.md` — combat / trading / skill-check adoption tracked there.
- `epic-rpg-mechanics.md` — combat, loot, inventory, skills shared; this epic owns battle UI/flow, RPG owns the mechanics.
- `epic-world-locations.md` — encounters, monsters, and location-based random encounters overlap; world owns location data.
- `epic-battle-ui.md` — panel/chat battle frontend for this epic's mechanics.
- `epic-battle-integration-gaps.md` — items/social/npc/weather/resolution integration tracking.

## Linked Tasks

- `TASK-rpg-battle-action-systems.md` (Done)
- `TASK-battle-arena-spectator.md` (Not Started)
- `TASK-chat-battle-mode-switch.md` (Not Started)
- `TASK-enemies-monsters-systems.md` (Not Started)
- `TASK-battle-template-actions.md` (Not Started)
- `TASK-battle-encounter-template-system.md` (Not Started)
