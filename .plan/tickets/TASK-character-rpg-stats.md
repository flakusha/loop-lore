# TASK-2026-048: Character RPG Stats System

**Status**: open
**Priority**: medium
**Labels**: feature, characters, rpg
**Assignee**:
**Epic**: EPIC-059 (Creative Studio)

## Description

Add optional RPG stats system to characters using state machines. Opt-in per world configuration. Supports ability scores, hit points, skills, equipment, and dynamic state.

### RPG Stats Reference

**Permanent Characteristics (Core identity)**

```toml
[permanent.identity]
race = "High Elf"
class = "Wizard"
background = "Sage"
alignment = "Chaotic Good"

[permanent.statistics]
ability_scores = { strength = 8, dexterity = 14, constitution = 12, intelligence = 17, wisdom = 13, charisma = 10 }
hit_dice = "1d6"
proficiency_bonus = 2
saving_throw_proficiencies = ["Intelligence", "Wisdom"]
skill_proficiencies = ["Arcana", "History", "Investigation", "Insight"]
```

**Temporary Characteristics (Dynamic state)**

```toml
[temporary.state]
current_hit_points = 8
temporary_hit_points = 0
conditions = [] # ["Poisoned", "Stunned", "Invisible"]
active_effects = []

[temporary.resources]
spell_slots = { level_1 = 3, level_2 = 2 }
consumables = [{ name = "Health Potion", quantity = 2 }]
```

**Cognition Parameters (Behavior modulation)**

```toml
[permanent.cognition]
behavior_profile = "suspect" # Options: quest_giver, merchant, suspect, companion
evasiveness = 0.7 # Likelihood to withhold information
cooperativeness = 0.3 # Likelihood to assist player
aggression_threshold = 0.8 # Point at which combat is initiated

[permanent.cognition.emotional_state]
current = "anxious"
transitions = [
  { to = "defensive", trigger_keywords = ["accuse", "lie", "arrest"] },
  { to = "remorseful", trigger_keywords = ["forgive", "understand", "help"] },
]
```

### Acceptance Criteria

- [ ] Add `stats` table to DB (optional, world-gated)
- [ ] Add `cognition` settings to character (behavior profile, evasiveness, cooperativeness)
- [ ] State machine for temporary character state (HP, conditions, effects)
- [ ] Merge into mood system (opt-in per world)

### Notes

State machine approach:

- `CharacterStatState` enum: `active`, `injured`, `unconscious`, `dead`
- `CharacterCondition` state machine with transitions
- `CharacterResource` state machine for spell slots, consumables

World-config determines if RPG mechanics are active.
