<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: AO NSFW Game Mechanics

**Status:** Draft
**Priority:** High
**Effort:** Very High
**Type:** Feature Epic
**Issue:** `30a1b4b`
**Tags:** nsfw, rpg, game-mechanics, adult, intimacy, relationships

## Overview

Game mechanics for adult/NSFW content — intimacy systems, seduction, relationship progression, adult encounters, desires, fetishes, pregnancy/reproduction, body systems, pheromones, aphrodisiacs, heat/rut cycles, and mature narrative mechanics. This epic covers the **gameplay layer** of NSFW content, not the safety/consent infrastructure (that lives in `epic-logic-reconciliation.md` NSFW Support section and `docs/.nsfw/research.md`).

## NSFW Gameplay Systems

### Intimacy & Relationship Progression

```typescript
interface IntimacySystem {
  // Intimacy levels between characters
  levels: {
    strangers: 0;
    acquaintances: 10;
    friends: 25;
    close_friends: 40;
    romantic_interest: 55;
    dating: 70;
    intimate: 85;
    soulbonded: 100;
  };

  // Intimacy actions that build/lose intimacy
  actions: IntimacyAction[];

  // Threshold events — unlock new interaction types at each level
  threshold_events: ThresholdEvent[];
}

interface IntimacyAction {
  id: string;
  name: string;
  type: "verbal" | "physical" | "gift" | "service" | "intimate";
  intimacy_change: number; // positive or negative
  requirements: {
    min_intimacy: number;
    relationship_type: string[];
    consent_given: boolean;
    location_type: string[];
  };
  effects: {
    mood_change: MoodEffect;
    trust_change: number;
    jealousy_triggers: string[];
    memory_created: boolean;
  };
}

interface ThresholdEvent {
  level: number;
  unlock: string; // New interaction type unlocked
  npc_reaction: string; // How NPC responds to reaching this level
  gameplay_effects: string[]; // What changes mechanically
}
```

### Seduction & Desire System

```typescript
interface SeductionSystem {
  // Seduction is a skill-based interaction
  // Characters have desires, fetishes, turn-ons, turn-offs

  desire_profile: DesireProfile;
  seduction_skills: SeductionSkill[];
  arousal_state: ArousalState;
}

interface DesireProfile {
  // What this character finds attractive
  turn_ons: DesireTag[]; // ['intelligence', 'dominance', 'humor', 'strength']
  turn_offs: DesireTag[]; // ['rudeness', 'cowardice', 'cruelty']
  fetishes: FetishTag[]; // ['bondage', 'exhibitionism', 'roleplay']
  hard_limits: DesireTag[]; // Never acceptable — enforced mechanically

  // Desire is dynamic — changes based on context, mood, relationship
  current_desire: number; // 0-100
  desire_decay_rate: number;
  desire_buildup_rate: number;
}

interface SeductionSkill {
  id: string;
  name: string; // 'Flirting', 'Dirty Talk', 'Massage', 'Dancing', 'Sexting'
  level: number; // 1-100
  effectiveness: number; // Modified by target's turn_ons
  failure_consequences: FailureConsequence[];
  success_bonuses: SuccessBonus[];
}

interface ArousalState {
  level: number; // 0-100 (0=calm, 50=aroused, 80=desperate, 100=climax)
  buildup_rate: number;
  decay_rate: number;
  modifiers: ArousalModifier[]; // Location, partner, mood, drugs
  effects: ArousalEffect[]; // What happens at each threshold
}

interface ArousalModifier {
  source: string; // 'location_public', 'partner_new', 'aphrodisiac', 'alcohol'
  multiplier: number; // 1.5x arousal buildup, 0.5x decay, etc.
  duration: number; // In turns/minutes
}
```

### Adult Encounter System

```typescript
interface AdultEncounter {
  // Structured adult scenes with mechanics

  id: string;
  type: EncounterType;
  participants: string[]; // Character IDs

  // Scene phases
  phases: EncounterPhase[];
  current_phase: number;

  // Mechanical outcomes
  outcomes: EncounterOutcome[];

  // Narrative elements
  intensity: "vanilla" | "mild" | "moderate" | "intense" | "extreme";
  content_tags: ContentTag[];
  narrative_style: "fade_to_black" | "implied" | "explicit" | "literary";
}

type EncounterType =
  | "romantic" // Tender, emotional
  | "passionate" // Intense but loving
  | "experimental" // Trying new things
  | "dominant" // Power exchange
  | "submissive" // Power exchange
  | "public" // Risk of discovery
  | "voyeuristic" // Watching/being watched
  | "group" // Multiple participants
  | "roleplay" // Fantasy scenarios
  | "rough" // Consensual rough play
  | "tender"; // Gentle, healing

interface EncounterPhase {
  name: string; // 'Foreplay', 'Building', 'Climax', 'Aftercare'
  duration: number; // Turns
  actions_available: string[];
  skill_checks: SkillCheck[];
  arousal_effects: ArousalEffect[];
  narrative_beats: string[];
}

interface EncounterOutcome {
  type: "satisfaction" | "dissatisfaction" | "injury" | "pregnancy" | "bonding" | "trauma" | "discovery";
  probability: number;
  effects: {
    intimacy_change: number;
    mood_change: MoodEffect;
    stat_changes: StatChange[];
    memory_created: boolean;
    reputation_change: number;
    relationship_change: string;
  };
}
```

### Body & Physical Systems

```typescript
interface BodySystem {
  // Physical attributes that affect gameplay
  physique: PhysiqueProfile;
  health: ReproductiveHealth;
  appearance: AppearanceProfile;
  modifications: BodyModification[];
}

interface PhysiqueProfile {
  // Physical stats that affect interactions
  stamina: number; // 1-100 — affects encounter duration
  flexibility: number; // 1-100 — affects available positions/actions
  sensitivity: number; // 1-100 — affects arousal buildup rate
  endurance: number; // 1-100 — affects recovery time

  // Size/shape attributes (affect compatibility)
  size_category: "petite" | "small" | "average" | "large" | "massive";
  build: "slim" | "athletic" | "average" | "curvy" | "muscular" | "heavy";
}

interface ReproductiveHealth {
  fertility: number; // 0-100
  pregnancy_risk: boolean;
  contraception: ContraceptionMethod[];
  sexually_transmitted: STDStatus;
  heat_cycle: HeatCycle | null; // For species with heat/rut
}

interface HeatCycle {
  // Species-specific reproductive cycles
  species: string;
  cycle_length_days: number;
  current_phase: "normal" | "pre_heat" | "heat" | "post_heat";
  days_until_next_heat: number;

  // Mechanical effects during heat
  effects: {
    arousal_multiplier: number; // 2x-3x arousal buildup
    seduction_resistance: number; // -50% resistance to seduction
    pheromone_emission: number; // Affects nearby characters
    fertility_boost: number; // 2x fertility during heat
    mood_instability: number; // Random mood swings
    desire_intensity: number; // Much higher desire
  };
}

interface AppearanceProfile {
  // Visual attributes affecting attraction/seduction
  beauty: number; // 1-100
  charisma: number; // 1-100
  style: number; // 1-100 — clothing/fashion sense
  scent: string; // Natural scent — affects pheromone interactions

  // Temporary modifiers
  temporary_appearance: TemporaryModifier[];
}

interface BodyModification {
  type: "piercing" | "tattoo" | "implant" | "marking" | "scar";
  location: string;
  visibility: "hidden" | "partial" | "visible";
  effects: {
    attractiveness_modifier: number;
    intimidation_modifier: number;
    fetish_appeal: FetishTag[];
  };
}
```

### Pheromones & Chemical Influence

```typescript
interface PheromoneSystem {
  // Biological/chemical attraction mechanics

  natural_pheromones: PheromoneProfile;
  synthetic_pheromones: SyntheticPheromone[];
  aphrodisiacs: Aphrodisiac[];
  resistance: ChemicalResistance;
}

interface PheromoneProfile {
  // Each character emits pheromones based on species/state
  species: string;
  intensity: number; // 0-100
  type: "attractive" | "neutral" | "repulsive";

  // Modified by state
  heat_modifier: number; // 2x during heat
  arousal_modifier: number; // 1.5x when aroused
  stress_modifier: number; // 0.5x when stressed

  // Species compatibility
  compatible_species: string[];
  incompatible_species: string[];
}

interface Aphrodisiac {
  id: string;
  name: string;
  type: "natural" | "alchemical" | "magical" | "technological";

  effects: {
    arousal_boost: number; // Immediate arousal increase
    arousal_buildup_rate: number; // Multiplier for future buildup
    resistance_reduction: number; // Reduces target's seduction resistance
    duration: number; // Turns/minutes
    side_effects: string[]; // Nausea, dizziness, addiction risk
  };

  // Application methods
  application: "consumed" | "inhaled" | "contact" | "injected";
  detection_dc: number; // How hard to detect (skill check)

  // Consent implications — MUST have consent system integration
  consent_required: boolean; // Always true for non-consensual = violation
  consent_aware: boolean; // Does target know they're affected?
}

interface ChemicalResistance {
  // Resistance to pheromones/aphrodisiacs
  base_resistance: number; // 0-100
  species_modifier: number;
  willpower_modifier: number;
  experience_modifier: number;

  // Resistance can be trained
  resistance_training: {
    times_exposed: number;
    resistance_growth: number;
    addiction_risk: number;
  };
}
```

### Fantasy & Kink Mechanics

```typescript
interface FantasySystem {
  // Mechanical support for various kinks/fantasies

  fantasies: Fantasy[];
  active_fantasies: string[];
  fantasy_fulfillment: FantasyFulfillment;

  // Kink discovery — characters discover new kinks through play
  kink_discovery: KinkDiscovery;
}

interface Fantasy {
  id: string;
  name: string;
  category: FantasyCategory;
  intensity: "mild" | "moderate" | "intense" | "extreme";

  // Fulfillment requirements
  requirements: {
    partner_type: string[];
    location_type: string[];
    equipment: string[];
    scenario: string[];
    min_intimacy: number;
    min_arousal: number;
  };

  // Mechanical effects when fulfilled
  fulfillment_effects: {
    satisfaction_bonus: number;
    intimacy_bonus: number;
    mood_bonus: MoodEffect;
    memory_strength: number; // How strong the memory is
    repeat_desire: number; // How much they want to do it again
  };

  // Risk factors
  risks: {
    reputation_risk: number;
    emotional_risk: number;
    physical_risk: number;
    discovery_risk: number;
  };
}

type FantasyCategory =
  | "power_exchange" // Dom/sub, bondage, discipline
  | "exhibitionism" // Public, risk of discovery
  | "voyeurism" // Watching others
  | "roleplay" // Costumes, scenarios, characters
  | "sensation" // Sensory play, impact, temperature
  | "group" // Multiple partners
  | "taboo" // Forbidden/dangerous contexts
  | "transformation" // Body modification, magic
  | "worship" // Body worship, service
  | "pet_play" // Animal roleplay
  | "age_play" // (Adults only, consensual)
  | "mind_control" // (Fantasy/magic context only)
  | "monster" // Non-human partners
  | "public_use" // (Consensual exhibition)
  | "breeding" // Reproduction-focused
  | "pain_play" // Impact, scratching, biting
  | "fluid_play" // (Consensual, health-aware)
  | "bondage" // Restraint, suspension
  | "service" // Obedience, servitude
  | "degradation" // (Consensual verbal)
  | "praise"; // Compliments, affirmation

interface KinkDiscovery {
  // Characters can discover new kinks through play
  discovered_kinks: DiscoveredKink[];
  kink_openness: number; // 0-100 — how open to new experiences
  kink_resistance: number; // 0-100 — how resistant to new kinks

  // Discovery triggers
  triggers: KinkTrigger[];
}

interface DiscoveredKink {
  kink_id: string;
  discovered_through: string; // What action/scenario led to discovery
  discovery_date: Date;
  initial_reaction: "positive" | "neutral" | "negative" | "shocked";
  current_feeling: "love" | "like" | "neutral" | "dislike" | "hate";
  times_explored: number;
}

interface KinkTrigger {
  action: string; // What happened
  context: string; // Where/when
  partner: string; // Who with
  discovery_chance: number; // 0-1 probability
  discovery_effects: string[];
}
```

### Pregnancy & Reproduction

```typescript
interface PregnancySystem {
  // Full pregnancy mechanics for species that reproduce sexually

  pregnancy_chance: PregnancyChance;
  pregnancy_state: PregnancyState | null;
  offspring: Offspring[];

  // Species-specific
  species_config: SpeciesReproduction;
}

interface PregnancyChance {
  base_chance: number; // 0-100 per encounter
  fertility_modifier: number; // Based on ReproductiveHealth
  heat_modifier: number; // 2x during heat
  contraception_modifier: number; // 0% if contraception used
  compatibility_modifier: number; // Species compatibility

  // Multiple factors
  timing_modifier: number; // Ovulation cycle
  health_modifier: number; // Overall health
  age_modifier: number; // Age affects fertility
}

interface PregnancyState {
  // Active pregnancy
  conception_date: Date;
  father_id: string;
  mother_id: string;

  // Development
  gestation_days: number;
  current_day: number;
  stage: "early" | "mid" | "late" | "labor";

  // Health
  health: number; // 0-100
  complications: PregnancyComplication[];

  // Mechanical effects on mother
  effects: {
    stamina_modifier: number; // Decreases over time
    sensitivity_modifier: number; // Increases
    mood_instability: number; // Random mood changes
    craving_system: Craving[]; // Random item/food desires
    movement_restriction: number; // Slows down in late stages
  };

  // Discovery
  known: boolean; // Does mother know?
  showing: boolean; // Visible to others?
  announced: boolean; // Publicly announced?
}

interface SpeciesReproduction {
  species: string;
  gestation_period_days: number;
  litter_size_min: number;
  litter_size_max: number;
  egg_based: boolean; // Egg-laying species
  live_birth: boolean;

  // Species-specific mechanics
  clutch_size?: number; // For egg-layers
  incubation_days?: number;
  hatching_requirements?: string[];

  // Cross-species compatibility
  compatible_species: string[];
  hybrid_viability: number; // 0-100 — chance of viable offspring
  hybrid_traits: string[]; // What traits hybrids get
}
```

### Sexual Skills & Experience

```typescript
interface SexualSkillSystem {
  // Skills that improve with practice

  skills: SexualSkill[];
  experience: SexualExperience;
  techniques: Technique[];
}

interface SexualSkill {
  id: string;
  name: string;
  category: SkillCategory;
  level: number; // 1-100

  // Skill improves through use
  experience_points: number;
  experience_to_next_level: number;

  // Skill effectiveness
  base_effectiveness: number;
  level_multiplier: number;

  // Skill synergies
  synergizes_with: string[]; // Other skills that boost this

  // Unlock conditions
  unlock_conditions: {
    min_intimacy: number;
    min_arousal: number;
    partner_type: string[];
    location_type: string[];
    equipment: string[];
  };
}

type SkillCategory =
  | "foreplay" // Kissing, touching, teasing
  | "oral" // Oral techniques
  | "penetrative" // Penetrative techniques
  | "anal" // Anal techniques
  | "manual" // Hand techniques
  | "toys" // Toy usage
  | "bdsm" // Bondage, discipline, sadism, masochism
  | "massage" // Sensual massage
  | "striptease" // Dance, tease
  | "dirty_talk" // Verbal arousal
  | "roleplay" // Fantasy scenarios
  | "aftercare" // Post-encounter care
  | "dominance" // Dom techniques
  | "submission" // Sub techniques
  | "exhibitionism" // Public play
  | "voyeurism" // Watching
  | "stamina" // Endurance
  | "sensitivity" // Reading partner
  | "creativity" // Novel approaches
  | "communication"; // Discussing desires

interface Technique {
  id: string;
  name: string;
  skill_requirement: { skill: string; min_level: number }[];

  // Effects
  arousal_effect: number;
  satisfaction_effect: number;
  intimacy_effect: number;

  // Requirements
  position_requirement?: string;
  equipment_requirement?: string[];
  location_requirement?: string[];

  // Risks
  risks: {
    injury_chance: number;
    discovery_chance: number;
    stamina_cost: number;
  };
}
```

### Mood & Emotional State

```typescript
interface NSFWEmotionalState {
  // Emotional state affects all NSFW interactions

  mood: NSFWMood;
  emotional_history: EmotionalEvent[];
  trauma: Trauma[];
  desires: ActiveDesire[];
}

interface NSFWMood {
  // Current emotional state
  arousal: number; // 0-100
  happiness: number; // 0-100
  comfort: number; // 0-100
  trust: number; // 0-100
  excitement: number; // 0-100
  nervousness: number; // 0-100
  shame: number; // 0-100
  guilt: number; // 0-100

  // Mood modifiers
  modifiers: MoodModifier[];

  // Mood effects on gameplay
  effects: {
    seduction_resistance: number; // Nervousness/shame increases resistance
    arousal_buildup: number; // Excitement increases buildup
    performance: number; // Happiness/comfort improves performance
    memory_strength: number; // Strong emotions = stronger memories
  };
}

interface Trauma {
  // Negative experiences that affect future interactions
  id: string;
  type: "violation" | "betrayal" | "humiliation" | "pain" | "discovery" | "rejection";
  severity: number; // 1-100
  source: string; // What caused it

  // Mechanical effects
  effects: {
    trigger_situations: string[]; // What situations trigger the trauma
    avoidance_behaviors: string[]; // What the character avoids
    trust_modifiers: { partner_type: string; modifier: number }[];
    therapy_progress: number; // 0-100 — recovery through therapy/positive experiences
  };

  // Recovery
  recovery: {
    therapy_sessions: number;
    positive_experiences: number;
    time_healing: number; // Days
    full_recovery: boolean;
  };
}
```

### Location & Environment

```typescript
interface NSFWLocation {
  // Locations affect NSFW encounters

  id: string;
  name: string;
  type: LocationType;

  // Privacy
  privacy_level: "public" | "semi_private" | "private" | "isolated";
  discovery_chance: number; // Chance of being caught

  // Atmosphere
  atmosphere: {
    romantic: number; // 0-100
    dangerous: number; // 0-100
    comfortable: number; // 0-100
    exotic: number; // 0-100
    seedy: number; // 0-100
  };

  // Available equipment
  equipment: string[];

  // Location-specific actions
  available_actions: string[];

  // Risks
  risks: {
    discovery: number;
    injury: number;
    arrest: number; // If public/illegal
    reputation: number;
  };
}

type LocationType =
  | "bedroom" // Classic private
  | "bathroom" // Semi-private, water play
  | "kitchen" // Semi-private, spontaneous
  | "living_room" // Semi-private
  | "dungeon" // Private, BDSM equipment
  | "brothel" // Professional setting
  | "tavern" // Semi-public, drinking
  | "alley" // Public, risky
  | "forest" // Outdoor, natural
  | "beach" // Outdoor, sand/water
  | "hot_spring" // Outdoor, water, relaxing
  | "carriage" // Moving, confined
  | "throne_room" // Power dynamic
  | "prison" // Power dynamic, non-consent risks
  | "temple" // Taboo, religious
  | "library" // Intellectual, quiet
  | "garden" // Romantic, natural
  | "balcony" // Exhibitionist
  | "stage" // Performance, exhibitionist
  | "club" // Social, group potential
  | "dressing_room" // Private, mirrors
  | "office" // Power dynamic
  | "classroom" // Power dynamic (adults only)
  | "hospital" // Uniform fetish
  | "workshop" // Crafting, toys
  | "arena"; // Public, performance
```

### Reputation & Social Consequences

```typescript
interface NSFWReputation {
  // Social consequences of NSFW activities

  sexual_reputation: ReputationScore;
  rumors: Rumor[];
  conquests: Conquest[];
  public_perception: PublicPerception;
}

interface ReputationScore {
  overall: number; // -100 to 100

  // Specific reputations
  promiscuity: number; // 0-100 — how many partners known
  skill: number; // 0-100 — reputation for skill
  kinkiness: number; // 0-100 — reputation for kink
  fidelity: number; // 0-100 — reputation for faithfulness
  danger: number; // 0-100 — reputation for risky behavior

  // Social effects
  effects: {
    seduction_modifier: number; // Reputation affects seduction difficulty
    partner_availability: number; // More reputation = more offers
    jealousy_risk: number; // Partners get jealous
    social_standing: number; // Affects social interactions
  };
}

interface Rumor {
  id: string;
  content: string;
  truth: boolean; // Is it true?
  spread_chance: number;
  believed_by: string[];
  source: string;

  // Effects
  effects: {
    reputation_change: number;
    relationship_effects: { partner: string; effect: number }[];
    social_consequences: string[];
  };
}
```

## Implementation Phases

### Phase 1: Core Intimacy & Relationship

- Intimacy levels and progression
- Basic seduction mechanics
- Threshold events
- Mood system basics

### Phase 2: Body & Physical Systems

- Physique profiles
- Appearance system
- Basic arousal mechanics
- Stamina/endurance

### Phase 3: Advanced Seduction

- Desire profiles
- Turn-ons/turn-offs
- Seduction skills
- Arousal modifiers

### Phase 4: Encounter System

- Adult encounter structure
- Encounter phases
- Skill checks during encounters
- Encounter outcomes

### Phase 5: Fantasy & Kink

- Fantasy system
- Kink discovery
- Fantasy fulfillment
- Kink mechanics

### Phase 6: Reproduction & Chemistry

- Pregnancy system
- Heat cycles
- Pheromone system
- Aphrodisiacs

### Phase 7: Social & Reputation

- Reputation system
- Rumors
- Social consequences
- Public perception

### Phase 8: Advanced Systems

- Trauma & recovery
- Species-specific mechanics
- Cross-species interactions
- Advanced techniques

## Open Questions

1. **Consent integration**: How do game mechanics interact with consent system? (All non-consensual = violation mechanics)
2. **Species mechanics**: How deep should species-specific reproduction/attraction go?
3. **Fade-to-black vs explicit**: Should mechanics work with both narrative styles?
4. **Age verification**: How do mechanics enforce age verification before activation?
5. **Content warnings**: Should mechanics trigger content warnings for extreme kinks?
6. **Balance**: How to balance NSFW mechanics with core gameplay so it doesn't dominate?
7. **LLM prompts**: How to prompt the LLM to handle NSFW mechanics accurately?
8. **Memory impact**: How do NSFW memories affect character relationships long-term?
9. **Multiplayer**: How do NSFW mechanics work in multi-user scenarios?
10. **Modding**: Should NSFW mechanics be moddable/extensible by plugins?

## Tasks

| Task                                | Priority | Effort    | Status      |
| ----------------------------------- | -------- | --------- | ----------- |
| TASK-nsfw-intimacy-system.md        | High     | Large     | Not Started |
| TASK-nsfw-seduction-desire.md       | High     | Large     | Not Started |
| TASK-nsfw-body-physical.md          | Medium   | Large     | Not Started |
| TASK-nsfw-encounter-system.md       | High     | Very High | Not Started |
| TASK-nsfw-fantasy-kink.md           | Medium   | Large     | Not Started |
| TASK-nsfw-pregnancy-reproduction.md | Medium   | Large     | Not Started |
| TASK-nsfw-pheromones-chemistry.md   | Medium   | Medium    | Not Started |
| TASK-nsfw-reputation-social.md      | Medium   | Medium    | Not Started |
| TASK-nsfw-skills-experience.md      | High     | Large     | Not Started |
| TASK-nsfw-mood-emotional.md         | High     | Medium    | Not Started |
| TASK-nsfw-location-environment.md   | Medium   | Medium    | Not Started |
| TASK-nsfw-heat-cycles.md            | Medium   | Medium    | Not Started |
| TASK-nsfw-trauma-recovery.md        | Medium   | Medium    | Not Started |
| TASK-nsfw-species-mechanics.md      | Low      | Very High | Not Started |

## Integration Points

### Systems This Epic Depends On

| System                 | What It Provides                           | How Used                                                        |
| ---------------------- | ------------------------------------------ | --------------------------------------------------------------- |
| RPG Mechanics          | Stats (CHA, WIS, CON), dice resolution, XP | Seduction skill checks, arousal calculations, XP for encounters |
| Character Core         | Personality, mood, relationships, traits   | Intimacy progression, mood modifiers, relationship state        |
| Social Interaction     | Persuasion, reputation, dialogue           | Seduction mechanics, reputation effects, social consequences    |
| Magic & Spell Systems  | Enchantment, potion effects                | Aphrodisiacs, magical seduction, heat cycle manipulation        |
| Crafting & Professions | Potion brewing, item creation              | Aphrodisiac crafting, contraceptive items, toys                 |
| Resolution System      | Unified dice/action resolution             | Skill checks during encounters, seduction rolls                 |

### Systems That Depend On This Epic

| System                  | What It Consumes                | How Used                                                       |
| ----------------------- | ------------------------------- | -------------------------------------------------------------- |
| Battle & Action Systems | Combat injuries, wounds         | Injury system from NSFW encounters, wound narratives           |
| Housing & Base Building | Private spaces, bedroom bonuses | NSFW encounters in player housing, comfort modifiers           |
| Weather & Environmental | Environmental mood              | Weather affects encounter atmosphere and location availability |
| Disease & Poison        | Reproductive health, STDs       | Pregnancy complications, sexually transmitted conditions       |
| Companion, Pet & Mount  | Companion relationships         | Romantic companions, bonding through intimacy                  |

### Shared Data Contracts

| Contract          | Shared With                       | Purpose                                                     |
| ----------------- | --------------------------------- | ----------------------------------------------------------- |
| `StatusEffect`    | RPG, Battle, Disease, Social      | Shared buff/debuff model (arousal, pheromone effects)       |
| `CharacterStats`  | RPG, Character Core, Social       | CHA/WIS/CON affect seduction and resistance                 |
| `ReputationScore` | Social, Crime, Faction            | Shared reputation model (NSFW reputation feeds into social) |
| `Relationship`    | Character Core, Social, Companion | Shared relationship state model                             |

### Cross-System Events

| Event                      | Direction                      | Purpose                                                  |
| -------------------------- | ------------------------------ | -------------------------------------------------------- |
| `intimacy.level_changed`   | emits → Social, Character Core | Relationship level changes affect social interactions    |
| `nsfw.encounter_completed` | emits → Disease, XP, Social    | Triggers pregnancy checks, grants XP, affects reputation |
| `nsfw.reputation_changed`  | emits → Social, Faction        | NSFW reputation affects faction standing                 |
| `housing.nsfw_encounter`   | subscribes ← Housing           | Housing provides private space modifiers for encounters  |
| `weather.changed`          | subscribes ← Weather           | Weather affects encounter atmosphere                     |

---

## Related Epics

- **Epic: RPG Mechanics** — Stats, combat, skills, XP, loot (NSFW skills are RPG skills)
- **Epic: Battle & Action Systems** — State management, mode transitions
- **Epic: World & Locations** — Locations, NPCs, environment
- **Epic: Logic Reconciliation** — NSFW support, moderation, safety
- **Epic: Plugin System** — NSFW content modding via plugins
- **Epic: Assistant/GM Flows** — GM-driven NSFW scenarios

## Linked Tasks

- TASK-nsfw-game-mechanics.md
- TASK-nsfw-reputation-consequences.md
