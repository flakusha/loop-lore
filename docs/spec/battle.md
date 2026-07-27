# Battle Specification

**Status:** Draft
**Authoritative source:** `src/` and `AGENTS.md`

---

## Overview

This document defines the battle system for loop-lore: turn-based combat, battle modes, action resolution, and the interaction between battle and normal chat.

---

## 1. Battle Data Model

### 1.1 Battle

```typescript
interface Battle {
  id: string;
  chat_id: string; // associated chat
  type: BattleType;
  mode: BattleMode;
  state: BattleState;
  participants: BattleParticipant[];
  turnOrder: string[]; // participant IDs
  currentTurn: number;
  turnTimeLimit?: number; // seconds per turn
  environment: BattleEnvironment;
  log: BattleLogEntry[];
  created_at: Date;
  started_at: Date | null;
  ended_at: Date | null;
}

enum BattleType {
  PvE = "pve", // player vs environment
  PvP = "pvp", // player vs player
  Hybrid = "hybrid", // mixed
}

enum BattleMode {
  Scripted = "scripted", // pre-defined logic, no LLM
  HalfLLM = "half_llm", // LLM narrates, mechanics are scripted
  FullLLM = "full_llm", // LLM controls all aspects
}

enum BattleState {
  Setup = "setup",
  Active = "active",
  Paused = "paused",
  Completed = "completed",
  Fled = "fled",
}
```

### 1.2 Battle Participant

```typescript
interface BattleParticipant {
  id: string;
  actor_id: string; // references actors table
  type: "player" | "npc" | "monster";
  team: string; // team identifier
  stats: BattleStats;
  position: BattlePosition;
  statusEffects: StatusEffect[];
  actions: BattleAction[];
  currentHp: number;
  currentMp: number;
  currentStamina: number;
  isAlive: boolean;
  isFled: boolean;
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
  criticalChance: number; // 0-100
  dodgeChance: number; // 0-100
  magicResistance: number; // 0-100
}

interface BattlePosition {
  x: number;
  y: number;
  zone: "front" | "back" | "flank" | "center";
  facing: "north" | "south" | "east" | "west";
}
```

### 1.3 Battle Environment

```typescript
interface BattleEnvironment {
  location_id: string | null;
  terrain: TerrainType;
  weather: WeatherCondition | null;
  timeOfDay: string;
  lighting: number; // 0-100
  obstacles: BattleObstacle[];
  coverPoints: CoverPoint[];
  elevation: Record<string, number>; // actor_id → elevation
}

enum TerrainType {
  Plains = "plains",
  Forest = "forest",
  Desert = "desert",
  Mountain = "mountain",
  Dungeon = "dungeon",
  Urban = "urban",
  Aquatic = "aquatic",
  Underground = "underground",
  Sky = "sky",
  Void = "void",
}

interface BattleObstacle {
  id: string;
  type: "wall" | "river" | "tree" | "rock" | "building" | "pit";
  position: { x: number; y: number };
  size: { width: number; height: number };
  blocking: boolean;
  destructible: boolean;
  hp: number | null;
}

interface CoverPoint {
  id: string;
  position: { x: number; y: number };
  coverage: "half" | "full" | "three_quarter";
  occupied_by: string | null; // actor_id
}
```

---

## 2. Turn Structure

### 2.1 Turn Flow

```
1. Initiative Check (start of battle)
2. Turn Begin
   a. Regenerate resources (HP, MP, stamina)
   b. Process status effects (tick durations)
   c. Check for battle-end conditions
3. Action Selection
   a. Player selects action (or AI selects for NPCs)
   b. Validate action requirements
4. Action Resolution
   a. Calculate effects (damage, healing, status)
   b. Apply effects
   c. Check for death/knockout
5. Turn End
   a. Process delayed effects
   b. Advance turn counter
   c. Check for battle-end conditions
6. Next Turn
```

### 2.2 Initiative

```typescript
interface InitiativeOrder {
  participants: string[]; // actor IDs in order
  calculated_at: Date;
  recalculate_on: "start" | "round_start" | "both";
}

// Initiative = speed + d20 roll
// Higher initiative acts first
// Ties broken by speed stat, then by actor_id
```

### 2.3 Action Points

```typescript
interface ActionPoints {
  base: number; // default actions per turn
  current: number;
  max: number;
  regeneration: number; // actions regenerated per turn
}

// Actions that cost action points:
// - Attack: 1 AP
// - Defend: 1 AP
// - Use Item: 1 AP
// - Cast Spell: 1-3 AP (varies by spell)
// - Special Ability: 2 AP
// - Flee: 2 AP
// - Defend: 1 AP
// - Wait: 0 AP (end turn early, recover 1 AP next turn)
```

---

## 3. Battle Actions

### 3.1 Action Types

| Action          | Cost   | Description                     |
| --------------- | ------ | ------------------------------- |
| Attack          | 1 AP   | Melee or ranged attack          |
| Defend          | 1 AP   | Increase defense, reduce damage |
| Use Item        | 1 AP   | Use a consumable or usable item |
| Cast Spell      | 1-3 AP | Cast a spell                    |
| Special Ability | 2 AP   | Class-specific ability          |
| Flee            | 2 AP   | Attempt to escape battle        |
| Wait            | 0 AP   | End turn early, recover AP      |
| Item Transfer   | 1 AP   | Give/take item (GM only)        |
| Status Apply    | 1 AP   | Apply status effect (GM only)   |
| Location Move   | 1 AP   | Move position on battlefield    |

### 3.2 Attack Resolution

```typescript
interface AttackResolution {
  attacker: BattleParticipant;
  defender: BattleParticipant;
  action: BattleAction;

  // Calculation
  baseDamage: number;
  statModifier: number; // from attacker's attack stat
  defenseReduction: number; // from defender's defense stat
  critical: boolean;
  criticalMultiplier: number;
  dodge: boolean;
  damage: number; // final damage after all modifiers

  // Effects
  statusEffectsApplied: StatusEffect[];
  hpChange: number;
  mpChange: number;
  staminaChange: number;
  killed: boolean;
}
```

### 3.3 Damage Types and Resistances

```typescript
interface DamageCalculation {
  baseDamage: number;
  damageType: DamageType; // from items/spec/items.md
  defenseType: DefenseType; // armor type vs damage type
  resistance: number; // 0-100, damage reduction
  vulnerability: number; // 0-100, damage increase
  finalDamage: number; // base × (1 - resistance/100) × (1 + vulnerability/100)
  minimumDamage: number; // always deal at least 1 damage (unless immune)
}
```

---

## 4. Battle Mode Switching

### 4.1 Mode Transitions

```typescript
interface BattleModeTransition {
  from: BattleMode;
  to: BattleMode;
  trigger: "player_action" | "gm_action" | "event" | "auto";
  allowed: boolean;
  state_preserved: string[]; // what state is kept during transition
  state_reset: string[]; // what state is reset during transition
  narrative: string; // LLM narration for the transition
}
```

### 4.2 Transition Rules

| Transition         | Allowed       | State Preserved                  | State Reset                         |
| ------------------ | ------------- | -------------------------------- | ----------------------------------- |
| Scripted → HalfLLM | Always        | HP, MP, position, status effects | Turn order, initiative              |
| HalfLLM → FullLLM  | Always        | All battle state                 | None                                |
| FullLLM → HalfLLM  | Always        | All battle state                 | None                                |
| Any → Scripted     | GM only       | HP, position                     | Turn order, initiative, LLM context |
| Any → Completed    | End of battle | None                             | Everything                          |
| Any → Fled         | Player action | None                             | Everything except character data    |

### 4.3 Battle Pause

Battles can be paused and resumed:

```typescript
interface BattlePause {
  battle_id: string;
  paused_at: Date;
  resumed_at: Date | null;
  duration: number; // total pause time in seconds
  reason: "player_request" | "disconnect" | "gm_action" | "event";
  state_snapshot: BattleState; // full state saved at pause
}
```

---

## 5. Status Effects

```typescript
interface StatusEffect {
  id: string;
  name: string;
  type: "buff" | "debuff" | "dot" | "hot" | "crowd_control" | "utility";
  duration: number; // turns remaining (-1 = permanent)
  tick_interval: number; // seconds between ticks (for DoT/HoT)
  effects: StatusEffectEntry[];
  source: string; // who applied this effect
  stackable: boolean;
  max_stacks: number;
  current_stacks: number;
  dispellable: boolean;
  icon: string | null;
}

interface StatusEffectEntry {
  stat: string;
  modifier: number; // flat or percentage
  modifier_type: "flat" | "percent_add" | "percent_multiply";
  duration: number; // remaining duration of this entry
}
```

---

## 6. Battle Persistence

### 6.1 What Persists

| Data               | Persists After Battle? | Notes                  |
| ------------------ | ---------------------- | ---------------------- |
| HP/MP/Stamina      | Yes                    | Carried to next battle |
| Equipment          | Yes                    | Carried to next battle |
| Status Effects     | No                     | Cleared at battle end  |
| Kill Count         | Yes                    | Tracked permanently    |
| Damage Dealt/Taken | Yes                    | Tracked in battle log  |
| Loot Won           | Yes                    | Added to inventory     |
| XP Earned          | Yes                    | Applied to character   |
| Battle Position    | No                     | Reset to default       |
| Temporary Buffs    | No                     | Cleared at battle end  |
| Debuffs            | No                     | Cleared at battle end  |

### 6.2 Battle Log

```sql
CREATE TABLE battle_logs (
  id TEXT PRIMARY KEY,
  battle_id TEXT NOT NULL REFERENCES battles(id),
  turn INTEGER NOT NULL,
  actor_id TEXT REFERENCES actors(id),
  action TEXT NOT NULL,
  target_id TEXT REFERENCES actors(id),
  result JSON NOT NULL DEFAULT '{}',
  damage_dealt INTEGER DEFAULT 0,
  damage_taken INTEGER DEFAULT 0,
  xp_earned INTEGER DEFAULT 0,
  items_won JSON DEFAULT '[]',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 7. Database Schema

### New Tables

```sql
CREATE TABLE battles (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id),
  type TEXT NOT NULL, -- 'pve', 'pvp', 'hybrid'
  mode TEXT NOT NULL, -- 'scripted', 'half_llm', 'full_llm'
  state TEXT NOT NULL DEFAULT 'setup', -- 'setup', 'active', 'paused', 'completed', 'fled'
  participants JSON NOT NULL DEFAULT '[]',
  turn_order TEXT NOT NULL DEFAULT '[]',
  current_turn INTEGER NOT NULL DEFAULT 0,
  environment JSON NOT NULL DEFAULT '{}',
  log JSON NOT NULL DEFAULT '[]',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  ended_at DATETIME
);

CREATE TABLE battle_participants (
  id TEXT PRIMARY KEY,
  battle_id TEXT NOT NULL REFERENCES battles(id),
  actor_id TEXT NOT NULL REFERENCES actors(id),
  type TEXT NOT NULL, -- 'player', 'npc', 'monster'
  team TEXT NOT NULL,
  stats JSON NOT NULL DEFAULT '{}',
  position JSON NOT NULL DEFAULT '{}',
  status_effects JSON NOT NULL DEFAULT '[]',
  current_hp REAL NOT NULL DEFAULT 0,
  current_mp REAL NOT NULL DEFAULT 0,
  current_stamina REAL NOT NULL DEFAULT 0,
  is_alive INTEGER NOT NULL DEFAULT 1,
  is_fled INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE battle_actions (
  id TEXT PRIMARY KEY,
  battle_id TEXT NOT NULL REFERENCES battles(id),
  turn INTEGER NOT NULL,
  actor_id TEXT NOT NULL REFERENCES actors(id),
  action_type TEXT NOT NULL,
  action_data JSON NOT NULL DEFAULT '{}',
  result JSON NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE status_effects (
  id TEXT PRIMARY KEY,
  battle_participant_id TEXT NOT NULL REFERENCES battle_participants(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'buff', 'debuff', 'dot', 'hot', 'crowd_control', 'utility'
  duration INTEGER NOT NULL DEFAULT -1,
  tick_interval INTEGER DEFAULT 0,
  effects JSON NOT NULL DEFAULT '[]',
  source TEXT, -- actor_id who applied this
  stackable INTEGER NOT NULL DEFAULT 0,
  max_stacks INTEGER NOT NULL DEFAULT 1,
  current_stacks INTEGER NOT NULL DEFAULT 1,
  dispellable INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 8. Implementation Notes

### Files to Create

| File                        | Purpose                  |
| --------------------------- | ------------------------ |
| `src/battle/types.ts`       | Battle type definitions  |
| `src/battle/engine.ts`      | Core battle engine       |
| `src/battle/turn.ts`        | Turn management          |
| `src/battle/actions.ts`     | Action resolution        |
| `src/battle/status.ts`      | Status effect management |
| `src/battle/modes.ts`       | Battle mode handling     |
| `src/battle/initiative.ts`  | Initiative calculation   |
| `src/battle/persistence.ts` | Battle state persistence |
| `src/db/schema-battle.ts`   | Battle schema types      |
| `src/routes/battle.ts`      | Battle API routes        |

### Files to Modify

| File                               | Purpose                      |
| ---------------------------------- | ---------------------------- |
| `src/chat/service.ts`              | Add battle state to chat     |
| `src/routes/chats.ts`              | Add battle endpoints         |
| `src/generation/actor-resolver.ts` | Add battle context injection |

---

## Reference

| Document                                         | Covers                                            |
| ------------------------------------------------ | ------------------------------------------------- |
| `docs/spec/rpg-mechanics.md`                     | RPG mechanics, dice, combat intent, plugin engine |
| `docs/spec/items.md`                             | Item definitions, damage types, resistances       |
| `docs/spec/inventory.md`                         | Inventory management, equipment slots             |
| `.plan/epics/epic-battle-action-systems.md`      | Battle action epic                                |
| `.plan/tickets/TASK-battle-action-systems.md`    | Battle action ticket                              |
| `.plan/tickets/TASK-chat-battle-mode-switch.md`  | Battle mode switching task                        |
| `.plan/tickets/TASK-enemies-monsters-systems.md` | Monster system task                               |
