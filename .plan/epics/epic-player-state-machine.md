<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Player State Machine — Cross-System Design

**Status:** 📝 Draft
**Created:** 2026-07-27
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** player-state, state-machine, cross-system, design
**Parent Epic:** RPG Mechanics & Extensible Game Systems (epic-rpg-mechanics.md)
**Purpose:** Define a unified `PlayerState` that every game system both produces and consumes, eliminating the current scattered, inconsistent state definitions.

> Extracted verbatim from the merged Player State Machine design section of
> `epic-rpg-mechanics.md`. NOT RPG-owned — this is a cross-system contract spanning
> Battle, Disease & Poison, NSFW Game Mechanics, Magic & Spell Systems, Stealth & Crime,
> and Character Core.

## Problem Statement

Player states are currently defined piecemeal across epics:

| Epic           | States Defined                            | Ownership Claimed          |
| -------------- | ----------------------------------------- | -------------------------- |
| Battle         | `StatusEffect[]` (generic)                | Combat health, positioning |
| Disease        | incapacitation, paralysis, sleep, death   | Affliction effects         |
| NSFW           | arousal levels (0-100), heat cycle        | Intimate state             |
| Magic          | `status_effect?: StatusEffect`            | Spell-induced conditions   |
| Stealth        | `StealthState` (visibility, awareness)    | Detection state            |
| Character Core | mood (happiness), personality (immutable) | Emotional baseline         |

**No epic owns "player state" as a concept.** Systems produce state effects that other systems need to consume, but there's no shared schema, no transition rules, and no conflict resolution.

## Design: Multi-Layer Player State

Player state is NOT a single enum. It's a **layered composite** — a character can be simultaneously `alive + stunned + poisoned + captioned + aroused`. Each layer is independent but can conflict.

### State Classification

Every state within a layer falls into one of two categories:

| Category      | Rule                                                        | Example                                        | Storage                  |
| ------------- | ----------------------------------------------------------- | ---------------------------------------------- | ------------------------ |
| **Exclusive** | Exactly ONE value per layer at any time. Transition = swap. | Vitality: `alive` ↔ `dead`                     | `enum` (single value)    |
| **Stackable** | Multiple conditions can coexist within/across layers.       | Physical: `poisoned` + `blinded` + `exhausted` | `Set<Condition>` (array) |

**Within a layer:** Exclusive states are **mutually exclusive** — you cannot be both `alive` AND `dead`. The layer holds exactly one exclusive state at a time.

**Across layers:** Stackable conditions **accumulate** — you CAN be `alive` (Vitality) + `stunned` (Consciousness) + `poisoned` (Physical) + `captioned` (Social) + `aroused` (NSFW) simultaneously.

**The rule of thumb:** If two states describe the **same aspect** of the character (e.g., "how alive are you?"), they're exclusive. If they describe **different aspects** (e.g., "are you poisoned?" vs "are you wounded?"), they stack.

```
Vitality:       EXCLUSIVE — one of: alive | undead | spectral | dead | petrified
Consciousness:  EXCLUSIVE — one of: conscious | unconscious | sleeping | stunned | paralyzed | comatose
Combat:         EXCLUSIVE — one of: healthy | wounded | critical | dying | stable | incapacitated
Social:         STACKABLE  — set of: disgraced | exiled | captioned | wanted | notorious | infamous | honored
Mental:         EXCLUSIVE — one of: sane | confused | charmed | dominated | frightened | panicked | berserk | obsessed | fascinated
Physical:       STACKABLE  — set of: poisoned | diseased | blinded | deafened | restrained | bound | exhausted | drunk | caffeinated
Environmental:  STACKABLE  — set of: exposed | frostbitten | heatstroke | drenched | in_ley_line | in_hazard | in_toxic_zone
NSFW:           EXCLUSIVE — one of: normal | aroused | in_heat | post_coital | satiated | desperate | addicted
```

**Exception — Dying is transient:** The `dying` state in Combat is NOT a static enum value. It's an **automatic state machine** with a ticking clock (death saves). See Layer 3 below for the full transition diagram.

### State Layers

```typescript
/**
 * Unified player state — a composite of independent layers.
 * Each layer is owned by a specific system but readable by all.
 * Produced via events, consumed via subscriptions.
 */
interface PlayerState {
  // === LAYER 1: Vitality (EXCLUSIVE) ===
  // Owner: RPG Mechanics (primary), Character Core (persistence)
  vitality: VitalityState;

  // === LAYER 2: Consciousness (EXCLUSIVE) ===
  // Owner: Resolution System (primary), Battle (combat-specific)
  consciousness: ConsciousnessState;

  // === LAYER 3: Combat Condition (EXCLUSIVE) ===
  // Owner: Battle & Action Systems
  combat: CombatState;

  // === LAYER 4: Social Identity (STACKABLE) ===
  // Owner: Social Interaction (primary), Faction, Crime
  social: SocialState;

  // === LAYER 5: Mental/Emotional (EXCLUSIVE) ===
  // Owner: Character Core (baseline), Magic (charm/domination), Social (fear)
  mental: MentalState;

  // === LAYER 6: Physical Condition (STACKABLE) ===
  // Owner: Disease & Poison (primary), Crafting (consumables), Magic (blindness etc.)
  physical: PhysicalState;

  // === LAYER 7: Environmental Exposure (STACKABLE) ===
  // Owner: Weather & Environment
  environmental: EnvironmentalState;

  // === LAYER 8: NSFW Condition (EXCLUSIVE) ===
  // Owner: NSFW Game Mechanics
  nsfw: NsfwState;

  // === Meta ===
  last_updated: Date;
  active_effects: ActiveEffect[]; // All currently applied effects with sources
}
```

### Layer Definitions

#### Layer 1: Vitality (EXCLUSIVE)

```typescript
type VitalityState =
  | "alive" // Normal living state
  | "undead" // Resurrected as undead (necromancy)
  | "spectral" // Ghost/spirit form
  | "dead" // Deceased — awaiting resurrection or permanent
  | "petrified"; // Turned to stone (alive but immobile)

// Transition sources:
//   alive → dead:      Battle (HP=0), Poison (lethal dose), Disease (mortality), Magic (death spell)
//   dead → alive:      Magic (resurrection), Divine (prayer), Quest (story resurrection)
//   alive → undead:    Magic (necromancy), Curse
//   alive → spectral:  Magic (astral projection), Death + resurrection quest
//   alive → petrified: Magic (petrification), Basilisk, Medusa
//   petrified → alive: Magic (stone to flesh), Alchemy (antidote)
```

#### Layer 2: Consciousness (EXCLUSIVE)

```typescript
type ConsciousnessState =
  | "conscious" // Normal awareness
  | "unconscious" // Knocked out,昏迷
  | "sleeping" // Natural rest or magical sleep
  | "stunned" // Temporarily disoriented (rounds)
  | "paralyzed" // Cannot move but aware
  | "comatose"; // Deep unconsciousness, requires intervention

// Transition sources:
//   conscious → unconscious:  Battle (critical hit), Poison, Disease, Magic
//   conscious → sleeping:     Rest mechanic, Magic (sleep spell), Fatigue
//   conscious → stunned:      Battle (critical hit), Explosion, Magic (daze)
//   conscious → paralyzed:    Disease, Poison, Magic (hold person), Restraint
//   conscious → comatose:     Disease (advanced stage), Poison (near-lethal), Magic
//   unconscious → conscious:  Time, Healing, Shout
//   sleeping → conscious:     Time, Alarm, Damage
//   stunned → conscious:      Time (rounds), Stabilize
//   paralyzed → conscious:    Cure, Time, Dispel
//   comatose → conscious:     Rare — requires specific cure or quest

// Conflict rules:
//   - Sleeping CANNOT coexist with Stunned (stunned wakes you)
//   - Paralyzed CAN coexist with Conscious (aware but immobile)
//   - Comatose OVERRIDES all other consciousness states
```

#### Layer 3: Combat Condition (EXCLUSIVE)

```typescript
/**
 * Combat state includes a TRANSIENT dying sub-state machine.
 * Dying is not a static enum — it progresses automatically via death saves.
 */
interface CombatState {
  condition: CombatCondition;
  hp: number;
  max_hp: number;
  temp_hp: number;
  initiative: number;
  position: BattlePosition;

  // === Dying sub-state machine (only active when condition === "dying") ===
  dying?: DyingState;
}

type CombatCondition =
  | "healthy" // HP > 50%
  | "wounded" // HP 25-50%
  | "critical" // HP < 25%
  | "dying" // HP = 0, making death saves — TRANSIENT, see DyingState
  | "stable" // HP = 0, stabilized but unconscious
  | "incapacitated"; // Cannot take actions (but alive)

/**
 * Dying is a transient state machine — not a static enum value.
 * It auto-progresses each round until it resolves to "stable" or "dead".
 *
 * Flow:
 *   critical → (HP hits 0) → dying (start death saves)
 *   dying → (3 saves passed) → stable (auto, unconscious)
 *   dying → (3 saves failed) → dead (auto, vitality syncs)
 *   dying → (healed to >0 HP) → wounded/healthy (exit dying)
 *   dying → (natural 20) → stable + regain 1 HP (auto-crit heal)
 *   dying → (natural 1) → 2 failures (auto, critical fail)
 */
interface DyingState {
  successes: number; // 0-3, how many death saves passed
  failures: number; // 0-3, how many death saves failed
  round: number; // Which round of dying we're in
  source: string; // What caused the 0 HP (battle, poison, etc.)
  stabilized_by?: string; // Who/what stabilized (if stable)

  /**
   * Auto-advance one round of death saves.
   * Returns the new CombatCondition after resolution.
   *
   * Roll d20:
   *   10+ → 1 success
   *   1-9  → 1 failure
   *   20   → 1 success + regain 1 HP → exit to "wounded"
   *   1    → 2 failures (critical fail)
   *
   * After roll:
   *   3 successes → "stable" (unconscious, condition = "stable")
   *   3 failures  → "dead" (vitality syncs to "dead")
   */
  advance(): CombatCondition;

  /**
   * Externally stabilize (e.g., Healer's kit, Medicine check).
   * Skips death saves, moves to "stable".
   */
  stabilize(healer_id: string,): CombatCondition;
}

// Combat condition transitions:
//   healthy → wounded:    Damage from Battle, Poison, Fall
//   wounded → critical:   Continued damage
//   critical → dying:     HP reaches 0 → STARTS DyingState sub-machine
//   dying → stable:       DyingState.advance() with 3 successes, OR stabilize()
//   dying → dead:         DyingState.advance() with 3 failures → syncs Vitality
//   dying → wounded:      Healed to >0 HP (exits dying, goes to wounded)
//   dying → healthy:      Healed to >50% HP (exits dying, goes to healthy)
//   stable → conscious:   Healed to >0 HP or time passes
//   any → incapacitated:  Poison, Disease, Magic, NSFW (exhaustion)
```

#### Layer 4: Social Identity (STACKABLE)

```typescript
/**
 * Social conditions are STACKABLE — you CAN be both captioned AND wanted,
 * or disgraced AND notorious. The set accumulates over time.
 */
interface SocialState {
  conditions: Set<SocialCondition>;
  faction_standing: Map<string, number>; // faction_id → standing (-100 to +100)
  active_bounty?: Bounty;
}

type SocialCondition =
  | "disgraced" // Lost reputation in a faction
  | "exiled" // Banished from a location/faction
  | "captioned" // Publicly labeled + visible marker (brand, tag, wanted mark)
  | "wanted" // Actively sought by authorities
  | "notorious" // Known criminal, recognized on sight
  | "infamous" // Legendary reputation (positive or negative)
  | "honored"; // Renowned, treated with respect

// Transition sources:
//   → disgraced:   Crime detected, Failed quest, Social scandal
//   → captioned:   Caught by faction, Branded as punishment, Public shaming
//   → wanted:      Crime committed, Bounty placed
//   → notorious:   Repeated crimes, High-profile actions
//   → honored:     Quest completion, Great deeds, Faction promotion
//   - disgraced:   Reputation repair quests, Time, Pardon
//   - captioned:   Remove marker (Alchemy, Magic, Surgery, Quest)
//   - wanted:      Surrender, Pay bounty, Exonerate, Escape
//   - notorious:   Very rare — requires major story event

// Stacking rules:
//   - captioned + wanted = "Marked Fugitive" (combined display state)
//   - honored + notorious = "Controversial" (mixed reputation)
//   - disgraced + honored = "Fallen Hero" (mixed reputation)
//   - exiled OVERRIDES location-based bonuses (can still be honored elsewhere)
```

#### Layer 5: Mental/Emotional (EXCLUSIVE)

```typescript
type MentalState =
  | "sane" // Normal mental state
  | "confused" // Disoriented, random actions
  | "charmed" // Friendly toward charmer (Magic, Social)
  | "dominated" // Under another's control (Magic)
  | "frightened" // Terrified, disadvantage on actions
  | "panicked" // Fear + flee behavior
  | "berserk" // Rage, attacks nearest target
  | "obsessed" // Fixated on target/goal
  | "fascinated"; // Distracted, limited awareness

// Transition sources:
//   sane → confused:    Disease, Poison, Magic (confusion), Psychic damage
//   sane → charmed:     Magic (charm), Social (hypnosis), Pheromones (NSFW)
//   sane → dominated:   Magic (domination), Dark artifact
//   sane → frightened:  Battle (intimidation), Horror, Magic (fear)
//   sane → panicked:    Frightened (escalation), Explosion, Ambush
//   sane → berserk:    Rage spell, Potion of fury, Provocation (Social)
//   sane → obsessed:    Curse, Love potion (NSFW), Quest hook
//   sane → fascinated:  Beauty, Magic (fascination), Music

// Conflict rules (EXCLUSIVE — only one at a time):
//   - Charmed CANNOT coexist with Frightened (mutually exclusive)
//   - Berserk OVERRIDES Charmed (rage breaks charm)
//   - Dominated OVERRIDES all other mental states
//   - Panicked = Frightened + cannot take voluntary actions (escalation, not separate)
```

#### Layer 6: Physical Condition (STACKABLE)

```typescript
/**
 * Physical conditions are STACKABLE — multiple can coexist.
 * This is the primary stackable layer. All conditions accumulate.
 */
type PhysicalCondition =
  | "poisoned" // Toxin active in system
  | "diseased" // Illness active
  | "blinded" // Cannot see
  | "deafened" // Cannot hear
  | "restrained" // Movement restricted (ropes, cage)
  | "bound" // Specifically tied/restrained (NSFW/crime)
  | "exhausted" // Fatigue from overexertion
  | "drunk" // Alcohol/substance impaired
  | "caffeinated"; // Stimulant boost (Crafting consumable)

interface PhysicalState {
  conditions: Set<PhysicalCondition>; // Stackable — multiple active
  exhaustion_level: number; // 0-6, each level adds penalties
  intoxication_level: number; // 0-100, affects judgment/coordination
}

// Transition sources:
//   → poisoned:   Poison application, Trap, Contaminated food
//   → diseased:   Contagion, Environmental exposure, Quest
//   → blinded:    Magic (blindness), Flash bomb, Disease
//   → deafened:   Magic, Explosion, Disease
//   → restrained: Crime (arrest), Battle (grapple), Trap
//   → bound:      Crime (capture), NSFW (bondage), Quest
//   → exhausted:  Overexertion, No rest, Disease, NSFW
//   → drunk:      Alcohol consumption, Poison (inebriation)
//   → caffeinated: Consumable (Crafting)

// Stacking rules:
//   - Poisoned + Diseased CAN coexist (stacking effects)
//   - Poisoned + Blinded CAN coexist (toxin causes blindness)
//   - Exhausted + Drunk CAN coexist (double penalty)
//   - Restrained + Bound are distinct (restrained = movement limited, bound = specifically tied)
//   - Exhaustion levels: each level adds cumulative penalties
//     Level 1: Disadvantage on ability checks
//     Level 2: Speed halved
//     Level 3: Disadvantage on attacks and saves
//     Level 4: Max HP halved
//     Level 5: Speed reduced to 0
//     Level 6: Death (Vitality → dead)
```

#### Layer 7: Environmental Exposure (STACKABLE)

```typescript
/**
 * Environmental conditions are STACKABLE — you CAN be frostbitten AND
 * in a toxic zone simultaneously. Multiple hazards compound.
 */
interface EnvironmentalState {
  conditions: Set<EnvironmentalCondition>;
  current_location?: string; // Location ID for context
}

type EnvironmentalCondition =
  | "exposed" // Weather effects active
  | "frostbitten" // Cold exposure (Weather)
  | "heatstroke" // Heat exposure (Weather)
  | "drenched" // Wet from rain (Weather)
  | "in_ley_line" // In magical energy zone (Magic)
  | "in_hazard" // In environmental hazard (Exploration)
  | "in_toxic_zone"; // Toxic environment (Disease, Weather)

// Transition sources:
//   → exposed:      Weather change, Outdoor location
//   → frostbitten:  Prolonged cold exposure
//   → heatstroke:   Prolonged heat exposure
//   → drenched:     Rain, Water magic
//   → in_ley_line:  Enter ley line location
//   → in_hazard:    Enter hazard zone
//   → in_toxic_zone: Enter toxic area (swamp, plague zone)

// Stacking rules:
//   - frostbitten + drenched = "hypothermia" (combined severe cold)
//   - heatstroke + in_toxic_zone = compounded environmental damage
//   - in_ley_line + in_hazard = magical hazard zone
//   - Conditions clear when leaving the location (some have lingering effects)
```

#### Layer 8: NSFW Condition (EXCLUSIVE)

```typescript
type NsfwState =
  | "normal" // Baseline
  | "aroused" // Level 1-4 arousal (arousal.level: 1-100)
  | "in_heat" // Species-specific fertility cycle
  | "post_coital" // After encounter, temporary state
  | "satiated" // Post-climax, temporary satisfaction
  | "desperate" // High arousal, need relief
  | "addicted"; // Substance/behavior dependency (NSFW consumable)

// Transition sources:
//   normal → aroused:     Seduction, Visual stimulus, Pheromones
//   aroused → in_heat:    Species cycle timing, Potion
//   aroused → desperate:  Prolonged arousal without relief
//   normal → post_coital: After encounter completion
//   post_coital → normal: Time decay
//   post_coital → satiated: High satisfaction threshold
//   normal → addicted:    Repeated NSFW consumable use

// Conflict rules (EXCLUSIVE — only one at a time):
//   - In Heat OVERTIDES normal arousal threshold (faster buildup)
//   - Desperate stacks with all mental states (impairs judgment)
//   - Post-coital provides temporary Consciousness penalty (drowsy)
```

## Cross-Layer Interactions

Some state changes cascade across layers. These are NOT conflicts — they're intentional interactions.

```typescript
interface StateInteraction {
  trigger: { layer: StateLayer; state: string };
  effect: { layer: StateLayer; state: string; condition?: string };
  description: string;
}

// Documented interactions:
const STATE_INTERACTIONS: StateInteraction[] = [
  // Vitality → Combat
  {
    trigger: { layer: "vitality", state: "dead", },
    effect: { layer: "combat", state: "incapacitated", },
    description: "Death clears combat state — all combat conditions irrelevant",
  },

  // Consciousness → Combat
  {
    trigger: { layer: "consciousness", state: "stunned", },
    effect: { layer: "combat", state: "incapacitated", },
    description: "Stunned = can't take actions",
  },
  {
    trigger: { layer: "consciousness", state: "paralyzed", },
    effect: { layer: "combat", state: "incapacitated", },
    description: "Paralyzed = can't act but aware",
  },
  {
    trigger: { layer: "consciousness", state: "unconscious", },
    effect: { layer: "combat", state: "incapacitated", },
    description: "Unconscious = incapacitated",
  },

  // Physical → Consciousness
  {
    trigger: { layer: "physical", state: "exhausted", },
    effect: { layer: "consciousness", state: "sleeping", },
    condition: "exhaustion >= 3",
    description: "Extreme exhaustion forces sleep",
  },

  // Mental → Combat
  {
    trigger: { layer: "mental", state: "berserk", },
    effect: { layer: "combat", state: "incapacitated", },
    condition: "berserk targets nearest, not strategic",
    description: "Berserk = no tactical control",
  },

  // NSFW → Consciousness
  {
    trigger: { layer: "nsfw", state: "post_coital", },
    effect: { layer: "consciousness", state: "stunned", },
    condition: "satisfaction >= 80",
    description: "Post-climax drowsiness",
  },

  // Social → Mental
  {
    trigger: { layer: "social", state: "captioned", },
    effect: { layer: "mental", state: "frightened", },
    condition: "if captured recently",
    description: "Captioning causes anxiety",
  },

  // Environmental → Physical
  {
    trigger: { layer: "environmental", state: "frostbitten", },
    effect: { layer: "physical", state: "exhausted", },
    condition: "prolonged exposure",
    description: "Cold drains energy",
  },

  // Disease → Multiple
  {
    trigger: { layer: "physical", state: "diseased", },
    effect: { layer: "combat", state: "wounded", },
    condition: "advanced stage",
    description: "Disease degrades combat readiness",
  },
];
```

## State Ownership Map

| Layer             | Type      | Primary Owner           | Producers (can cause transitions)             | Consumers (react to state)          |
| ----------------- | --------- | ----------------------- | --------------------------------------------- | ----------------------------------- |
| **Vitality**      | Exclusive | RPG Mechanics           | Battle, Poison, Disease, Magic, Quest         | All systems (alive check)           |
| **Consciousness** | Exclusive | Resolution System       | Battle, Poison, Disease, Magic, Rest          | Battle, Social, NSFW, Exploration   |
| **Combat**        | Exclusive | Battle & Action Systems | Battle damage, Healing, Poison                | Battle AI, NPC behavior             |
| **Social**        | Stackable | Social Interaction      | Crime, Faction, Quest, Social checks          | NPC dialogue, Shop prices, Guards   |
| **Mental**        | Exclusive | Character Core          | Magic, Social, NSFW (pheromones), Disease     | Battle AI, Dialogue, NPC reactions  |
| **Physical**      | Stackable | Disease & Poison        | Poison, Disease, Magic, Crafting, Trap        | Battle, Exploration, NSFW           |
| **Environmental** | Stackable | Weather & Environment   | Weather, Exploration, Location                | All outdoor systems                 |
| **NSFW**          | Exclusive | NSFW Game Mechanics     | Seduction, Pheromones, Items, NSFW encounters | Social, Mental, Disease (pregnancy) |

## Event Schema

```typescript
// Emitted when ANY layer changes
interface PlayerStateChanged {
  character_id: string;
  layer: StateLayer;
  previous_state: string | string[]; // string for exclusive, string[] for stackable
  new_state: string | string[]; // string for exclusive, string[] for stackable
  source_system: string; // Which epic caused this
  source_event?: string; // Specific event that triggered it
  duration?: number; // Turns/minutes until auto-revert (0 = permanent)
  stackable: boolean; // Can this state stack with itself?
  metadata?: Record<string, unknown>; // Layer-specific data
}

type StateLayer =
  | "vitality"
  | "consciousness"
  | "combat"
  | "social"
  | "mental"
  | "physical"
  | "environmental"
  | "nsfw";

// Systems subscribe to specific layers:
// Battle subscribes to: consciousness, combat, physical, mental, environmental
// Social subscribes to: social, mental, consciousness
// NSFW subscribes to: nsfw, mental, physical, consciousness
// Exploration subscribes to: environmental, consciousness, physical
// etc.
```

## Transition Priority & Conflict Resolution

When multiple systems try to set the same layer simultaneously:

1. **Hard Override**: Vitality "dead" overrides EVERYTHING. If you're dead, no other state matters.
2. **Severity Wins** (exclusive layers): For consciousness, `comatose > paralyzed > stunned > unconscious > sleeping > conscious`.
3. **Source Priority** (exclusive layers): For mental states, `domination > berserk > charm > fright > confused > sane`.
4. **Stacking** (stackable layers): Physical conditions accumulate. Social conditions accumulate. Environmental conditions accumulate. No conflict — they compound.
5. **Duration**: Temporary effects (stunned for 2 rounds) revert automatically. Permanent effects (captioned) require explicit action to remove.

### Dying Resolution

The `dying` state has special resolution rules (it's the only transient state):

```
HP hits 0
    │
    ▼
┌─────────┐     d20 10+      ┌─────────┐
│  Dying  │──────────────────▶│ Stable  │ (3 successes)
│ (start) │                   │ (uncon.)│
└─────────┘                   └─────────┘
    │                              ▲
    │ d20 1-9                      │ Healed to >0 HP
    │ (1 failure)                  │
    ▼                              │
┌─────────┐     d20 1           │
│ Dying   │───────────────────  │
│ (fail 1)│  (2 failures!)      │
└─────────┘                      │
    │                            │
    │ 3 failures                 │
    ▼                            │
┌─────────┐                      │
│  Dead   │    Resurrection      │
│         │──────────────────────┘
└─────────┘
    │
    │ d20 20
    │ (natural 20!)
    ▼
┌──────────┐
│ Stable + │  Regain 1 HP, exit dying
│ 1 HP     │
└──────────┘
```

## Resurrection & Revive Mechanics

Resurrection is a cross-system mechanic that affects the Vitality layer. It determines whether death is **temporary** (revive possible) or **permanent** (ironman/permadeath).

### Revive Modes

```typescript
/**
 * World-level configuration for death handling.
 * Set per-world in config extensions.
 */
interface DeathConfig {
  /** How death is handled in this world */
  revive_mode: ReviveMode;

  /** Maximum number of revives per character (0 = unlimited, -1 = none) */
  max_revives?: number;

  /** Cooldown between revives (turns/minutes) */
  revive_cooldown?: number;

  /** Consequences applied after each revive */
  revive_consequences?: ReviveConsequence[];
}

type ReviveMode =
  | "full" // Revive fully restores character, no penalty
  | "penalized" // Revive possible but with stat/soul penalties
  | "story_only" // Revive only through specific quest/narrative events
  | "one_per_arc" // One revive per story arc, then permanent
  | "ironman" // Death is permanent — no revives
  | "soft_ironman"; // Death is permanent but character can be reborn as new character with some carried progress
```

### Revive Methods

| Method                 | Source                           | Availability | Consequences                       | ReviveMode      |
| ---------------------- | -------------------------------- | ------------ | ---------------------------------- | --------------- |
| **Healing**            | Cleric/Priest NPC                | Common       | None (if HP > 0)                   | full, penalized |
| **Resurrection Spell** | Divine Magic (8th+ level)        | Rare         | Stat penalty, memory loss          | full, penalized |
| **True Resurrection**  | Divine Magic (9th level)         | Very rare    | Full restore, expensive components | full            |
| **Phoenix Down**       | Consumable (Crafting)            | Common       | -1 max HP per use                  | full, penalized |
| **Soul Binding**       | Necromancy                       | Rare         | Undead status, alignment shift     | penalized       |
| **Quest Revival**      | Story event                      | One-time     | Story consequences                 | story_only      |
| **Rebirth**            | World event / deity intervention | Legendary    | New body, carry memories           | soft_ironman    |
| **Cloning**            | Technology/alchemy               | Rare         | Clone has minor differences        | full, penalized |

### Revive Consequences

```typescript
interface ReviveConsequence {
  type: ReviveConsequenceType;
  magnitude: number; // Severity 1-10
  duration?: number; // Turns/minutes (0 = permanent)
  description: string;
}

type ReviveConsequenceType =
  | "stat_penalty" // Temporary or permanent stat reduction
  | "max_hp_reduction" // Permanent max HP reduction per revive
  | "memory_loss" // Lose recent memories (narrative consequence)
  | "soul_damage" // Reduces maximum soul/spirit pool
  | "experience_loss" // Lose percentage of XP
  | "alignment_shift" // Moral alignment changes
  | "undead_status" // Revived as undead (necromancy)
  | "curse" // Revival curse (recurring penalty)
  | "cooldown" // Cannot be revived again for N turns
  | "reputation"; // NPCs treat you differently ("the resurrected")
```

### Permadeath / Ironman Configuration

```typescript
interface IronmanConfig {
  enabled: boolean; // Master switch

  /** What happens on permanent death */
  death_handling:
    | "delete" // Character deleted permanently
    | "archive" // Character moved to hall of fame, new character starts
    | "ghost" // Character becomes NPC ghost, new character starts
    | "inherit"; // New character inherits some items/progress from dead character

  /** Items transferred to new character on death (0 = none, -1 = all) */
  item_inheritance: number; // Percentage of items kept

  /** XP carried over to new character */
  xp_inheritance: number; // Percentage of XP kept

  /** Skills/knowledge carried over */
  skill_inheritance: SkillInheritance;
}

interface SkillInheritance {
  keep_skills: boolean; // New character starts with old skills?
  keep_recipes: boolean; // Crafting recipes persist?
  keep_spells: boolean; // Spell knowledge persists?
  keep_faction_standing: boolean; // Faction reputation persists?
}
```

### State Machine Impact

Death config affects the `dead → alive` transition in the Vitality layer:

```typescript
// In VitalityState transitions:
//   dead → alive: ONLY possible if:
//     1. ReviveMode is NOT "ironman" or "soft_ironman"
//     2. max_revives not exceeded (if configured)
//     3. revive_cooldown has elapsed (if configured)
//     4. A valid revive method is available (spell, item, quest)
//
//   dead → undead: Possible in ALL modes (necromancy does not respect ironman)
//   dead → ghost: Only in soft_ironman mode
//
// If ironman mode:
//   dead → dead (permanent) — no transition possible
//   Dead character becomes NPC ghost or is archived
```

### DyingState Integration

The `DyingState` sub-machine interacts with revive config:

```typescript
interface DyingState {
  // ... existing fields ...

  /** Whether this character can be revived (checked at death saves resolution) */
  can_revive: boolean; // false if ironman AND max_revives reached

  /** Revives used so far */
  revives_used: number;

  /** Whether this death is permanent */
  is_permanent: boolean; // true if ironman, or max_revives exceeded
}
```

### Open Questions for Resurrection

1. Should resurrection be available in combat (e.g., "revive as bonus action") or only after battle?
2. How to handle resurrection in PvP — should killed players revive or go permadeath?
3. Should there be a "resurrection economy" where high-level clerics charge gold?
4. How to handle resurrection across different worlds with different ReviveMode settings?
5. Should soft_ironman "reborn" characters share a soul link with their predecessor?
6. Can resurrection be interrupted (enemy destroys the body before revival completes)?

---

## Migration Path

### Phase 1: Define the schema (this document)

- Establish the `PlayerState` interface
- Document all layers and transitions
- Define event schema

### Phase 2: Update existing epics

- Each epic's `StatusEffect` or condition types → map to the appropriate layer
- Battle's `StatusEffect[]` → `CombatState` + `PhysicalState` + `MentalState`
- Disease's symptom types → `PhysicalState` + `VitalityState`
- NSFW's arousal → `NsfwState`
- Magic's status effects → map to target layer based on spell type

### Phase 3: Create shared module

- `src/state/player-state.ts` — the canonical definition
- `src/state/transitions.ts` — transition rules and conflict resolution
- `src/state/events.ts` — event emission and subscription

### Phase 4: Wire systems

- Each epic emits `PlayerStateChanged` when it causes a transition
- Each epic subscribes to layers it needs to react to
- Conflict resolution module arbitrates simultaneous changes

## Open Questions

1. **State persistence**: Should `PlayerState` be a DB column or computed from active effects?
   - Recommendation: Store `active_effects` in DB; compute current state from effects (like D&D 5e's condition stacking).

2. **Multi-character battles**: How does state work when multiple characters interact?
   - Each character has their own `PlayerState`. Interactions are events between states.

3. **NPC state**: Should NPCs use the same state machine?
   - Yes — simplified version (no NSFW layer for most NPCs, no Social identity layer for monsters).

4. **State UI**: How to display 8 layers of state without overwhelming the player?
   - Priority display: Vitality > Combat > Consciousness > Physical > Mental > Social > NSFW > Environmental
   - Collapsed by default, expandable on hover/click.

### Mode Transitions (carried from epic-rpg-mechanics.md)

- How to handle concurrent modes (e.g., trading during battle)?
- Should modes be mutually exclusive or layered?
- How to persist mode state across sessions?
- Should mode transitions be reversible?
- How to handle mode conflicts (e.g., battle interrupting trade)?

## Related Epics

- `epic-rpg-mechanics.md` (parent hub)
- `epic-battle-action-systems.md`, `epic-disease-poison.md`, `epic-nsfw-game-mechanics.md`, `epic-magic-spell-systems.md`, `epic-stealth-crime.md`, `epic-character-core-system.md` — layer owners/consumers per the State Ownership Map above

## Dependencies

- **Parent hub:** epic-rpg-mechanics.md (extracted from its merged design section)
- **Not RPG-owned:** cross-system contract; each layer's Primary Owner in the State Ownership Map drives its transitions
- **Implementation note:** a layer-model scaffold already exists at `src/rpg/integration-registry/player-state-layers.ts` — reconcile this design against it during Phase 3 (`src/state/*`)
