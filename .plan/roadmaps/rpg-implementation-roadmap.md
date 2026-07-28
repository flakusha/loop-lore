> **Last updated:** 2026-07-28 — reconciliation pass complete.
> **Reconcile status:** 0 issues (was 135).
> **Epics:** 113 | **Specs:** 65 | **Tickets:** 340+

# RPG Mechanics Implementation Roadmap

## Phase 1: Dice Engine (Standalone)

### File: src/rpg/dice.ts

```typescript
export interface DiceRoll {
  total: number;
  rolls: number[];
  modifier: number;
  notation: string;
}

export function rollDice(notation: string,): DiceRoll;
export function rollDice(notation: string, seed?: number,): DiceRoll; // deterministic mode
```

**Notation**: d4, d6, d8, d12, d20, 2d6+3, etc.

### File: src/rpg/dice.test.ts

- Test all standard dice
- Test modifiers
- Test seeded rolls for deterministic mode

## Phase 2: Stat System

### File: src/rpg/stats.ts

Core attributes:

- STR, DEX, CON, INT, WIS, CHA

Stat block interface on actors table:

```json
{
  "stats": {
    "str": 16,
    "dex": 14,
    "con": 12,
    "int": 10,
    "wis": 13,
    "cha": 8
  },
  "modifiers": {
    "str": "+3",
    "dex": "+2"
  }
}
```

## Phase 3: Combat System

### File: src/rpg/combat.ts

Combat intent extraction from LLM:

```json
{
  "intent": "attack",
  "target": "actor_id",
  "weapon": "longsword",
  "advantage": false,
  "modifier": 2
}
```

Damage formula: 1d8 + STR modifier

### Command Access Tiers

Commands have access tiers based on world rules:

| Command  | Default Tier | GM Override         |
| -------- | ------------ | ------------------- |
| /improve | all          | whitelist/blacklist |
| /dice    | all          | whitelist/blacklist |
| /stats   | all          | whitelist/blacklist |
| /attack  | member       | whitelist/blacklist |
| /damage  | gm           | whitelist/blacklist |
| /heal    | gm           | whitelist/blacklist |
| /quest   | gm           | whitelist/blacklist |
| /image   | member       | configurable cost   |

## Phase 4: Items & Equipment

### File: src/rpg/items.ts

Equipment slots: head, chest, legs, feet, hands, mainHand, offHand, ring1, ring2, amulet, cloak

Item types: weapon, armor, consumable, key_item, currency, container, tool, misc

## Phase 5: Skills & XP

### File: src/rpg/skills.ts

Skills derived from attributes:

- Athletics (STR), Acrobatics (DEX), Stealth (DEX)
- Perception (WIS), Arcana (INT), Investigation (INT)
- Medicine (WIS), Survival (WIS), Persuasion (CHA)
- Intimidation (CHA), Animal Handling (WIS), History (INT)

### File: src/rpg/xp.ts

XP tracking on world actor state, level-up logic.
