<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Character Core System

**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** verified 2026-10-09: the character API and its companion services ship (`charactersRoutes` + traits/mood/relationships/avatars/emotions/availability/licensing/IO mounted in `src/routes/v1/actors-surface.ts:56-76`), the RPG stat system ships (`src/rpg/stats/` + `src/rpg/service/character-stats.ts`), and character template seeding ships (`src/characters/seed/`); open — the six-slice stat-allocation extension (no `character_stat_allocation` / `requires_stats` anywhere in `src/` or `configs/`) and the four-tier memory extension (no episodic/semantic/procedural tables).
**Priority:** High
**Effort:** High
**Type:** Foundation Epic
**Tags:** characters, stats, personality, core-system

## Summary

Core character data model and services — mandatory/optional fields, RPG stats, personality traits, validation, and the unified character API. Foundation for character generation, import, and all character-consuming systems.

## Reference

- Spec: `docs/spec/character-spec.md` (authoritative; compressed to 37 lines — the detailed constraint tables now live in `src/characters/validator/`, per its own "Unique content" note)
- Spec: `docs/spec/character-interactions.md`
- Spec: `docs/spec/rpg-mechanics.md`

## Scope

- Mandatory fields: `name`, `description`, `personality`
- Optional fields: `nickname`, `scenario`, `welcome_message`, `mes_example`, `system_prompt`, `post_history_instructions`, `alternate_greetings`, `tags`, `creator`
- RPG stats (STR, DEX, CON, INT, WIS, CHA, etc.)
- Personality traits, bonds, flaws, ideals
- Character validation (field lengths, constraints)
- Unified character API

## Implemented (verified 2026-10-09)

- **Unified character API** — `charactersRoutes` registered at
  `src/routes/v1/actors-surface.ts:56` and mounted through `src/routes/v1/index.ts:61`;
  the sub-plugins `list` / `create` / `read` / `card` / `update` / `remove` / `export` /
  `approval` are assembled in `src/routes/characters/index.ts:23-33`. Routes cover
  `GET/POST /api/actors`, `GET/PUT/DELETE /api/actors/:actorId`,
  `GET /api/actors/:actorId/card`, `GET /api/actors/:actorId/export`, `POST /api/actors/import`.
- **Companion character sub-routes** — all mounted in
  `src/routes/v1/actors-surface.ts:62-76`: `character-traits`,
  `character-world-setup`, `character-internal-traits`, `character-growth`,
  `character-mood`, `character-relationships`, `character-avatars`,
  `character-emotions`, `character-emotion-avatars`, `character-availability`,
  `character-licensing`, `character-io` (plus wardrobe and outfit overrides).
- **Personality + traits services** — `src/characters/services/personality-service/`
  and `src/characters/services/traits-service/` (directories, not the flat files this
  epic used to cite), with the immutability rules at `personality-service/integrity.ts`.
- **Character validation** — `src/characters/validator/` (`validateCharacter`, strict /
  relaxed) plus the TypeBox shapes in `src/validation/schemas/` (a directory — the
  flat `schemas.ts` this epic used to cite does not exist).
- **RPG stat system** — `src/rpg/stats/`: `types.ts` (`StatBlock`, `AbilityName`,
  `SkillName`), `generation.ts` (`pointBuy` / `standardArray` / `rollStats4d6` /
  `statBlockFromArray`), `modifiers.ts` (`abilityModifier` / `computeModifiers` /
  `getModifier`), `proficiency.ts` (`proficiencyBonus`), `validation.ts`
  (`validateStatBlock`, `MIN_STAT`/`MAX_STAT`), all re-exported from `stats/index.ts`;
  runtime persistence in `src/rpg/service/character-stats.ts`
  (`createCharacterStats` / `getCharacterStats` / `updateCharacterStats`). Tests:
  `src/rpg/stats/*.test.ts`, `src/rpg/service/character-stats.test.ts`.
- **RPG subsystem** — dice, combat, achievements, crafting and encounters under
  `src/rpg/` (and `src/rpg/stats/`); there is **no spells module** anywhere in `src/`,
  so the long-standing "dice, combat, achievements, crafting, encounters, spells" claim
  was wrong on its last item. HTTP surfaces live under `src/routes/rpg/`.
- **Character template seeding** — see the merged section at the end of this file;
  wired at `src/server/init-background-services.ts:37-52`.
- **Import/export** — per `epic-import-export-io.md`; single-actor IO at
  `src/routes/character-io/`.

## Current State

| Surface | Status | Where |
| ------- | ------ | ----- |
| Unified character API (CRUD + card + export) | Shipped | `src/routes/characters/`, mounted at `src/routes/v1/actors-surface.ts:56` |
| Companion character sub-routes | Shipped | `src/routes/v1/actors-surface.ts:62-76` |
| Personality + traits services | Shipped | `src/characters/services/personality-service/`, `src/characters/services/traits-service/` |
| Character validation schemas | Shipped | `src/characters/validator/`, `src/validation/schemas.ts` |
| RPG stat system (base stats, modifiers, derived) | Shipped | `src/rpg/stats/`, `src/rpg/service/character-stats.ts` |
| Character search/filter (`page` / `pageSize` / `type`) | Shipped | `src/routes/characters/list.ts:21-24` |
| Character template seeding | Shipped | `src/characters/seed/`, `src/server/init-background-services.ts:37` |
| Import/export | Shipped | `src/routes/character-io/`, `src/characters/parser.ts` — see `epic-import-export-io.md` |
| Stat-allocation extension (the six slices below) | Not shipped | no `character_stat_allocation`, `character_trait_assignments`, `requires_stats` or `stat_point_budget` anywhere in `src/` or `configs/` |
| Four-tier memory extension (`CharacterMemory`) | Not shipped | no episodic / semantic / procedural / consolidation tables in `src/db/migrations/001_init.ts` |
| Character-growth research extension (table below) | Superseded by `epic-character-growth.md` | `character_arc` (`001_init.ts:1096`) and `growth_log` (`:1106`) now ship; rows below annotated |
| Cross-system events (`character.stats_changed`, `character.relationship_changed`, `memory.emotion_applied`) | Not shipped | no emitter or subscriber anywhere in `src/` |

## Unticketed Gaps

Two things here have no ticket. The **cross-system events table further down** promises
`character.stats_changed`, `character.relationship_changed` and `memory.emotion_applied`
as an integration contract, but no string, emitter or subscriber for any of the three
exists in `src/` — downstream systems (achievements, battle, companion bonding) are
reading stat and relationship state directly instead of reacting to it, so a stat change
is invisible to anything not polling. Second, **stat provenance is undocumented**: the
stat system ships generation, modifiers, proficiency and persistence, yet nothing in
`src/` records where a given character's numbers came from (point-buy versus roll
versus GM edit), so `TASK-character-stat-allocation-*` cannot distinguish a baseline
block from an allocated one when it lands. The six stat-allocation slices and the
eleven memory/growth rows below all have tickets; these two do not.

## Tasks

- [x] Character validation schemas (field lengths, required fields) — TypeBox `src/validation/schemas/`
- [x] Personality trait system — `src/characters/services/traits-service/` + `src/characters/services/personality-service/`
- [x] Character CRUD API routes — `src/routes/characters/` (wired at `src/routes/v1/actors-surface.ts:56`, tested)
- [x] Character search/filter — `GET /api/actors` with `page`/`pageSize`/`type` query (`src/routes/characters/list.ts:24`)
- [x] RPG stat system (base stats, modifiers, derived stats) — shipped: `src/rpg/stats/` (point-buy / standard-array / 4d6 generation, `abilityModifier` + `computeModifiers`, `proficiencyBonus`, `validateStatBlock`) with `src/rpg/service/character-stats.ts` for persistence (verified 2026-10-09)
- [x] Character template system — template seeding shipped: `src/characters/seed/` (`mergeCharacterTemplates` / `seedCharacterTemplates`) called from `src/server/init-background-services.ts:37-52` (verified 2026-10-09); the prompt-template-registry work named here is a separate concern

## Files

Implemented (verified 2026-10-09):

- `src/db/schema-core.ts` — Actors table (shared with actor system)
- `src/routes/characters/` — character API directory (supersedes the flat `src/routes/characters.ts` this epic used to cite)
- `src/routes/v1/actors-surface.ts` — mounting point for the character surface
- `src/characters/validator/` — field/outfit/content-rating/extension validation
- `src/characters/services/personality-service/`, `src/characters/services/traits-service/` — trait system
- `src/rpg/stats/`, `src/rpg/service/character-stats.ts` — stat calculations and persistence
- `src/characters/seed/` — character template seeding
- `src/validation/schemas/` — TypeBox request/response schemas

Planned (do not exist yet):

- `src/routes/characters.ts` — superseded by the `src/routes/characters/` directory
- `src/validation/schemas.ts` — superseded by the `src/validation/schemas/` directory
- a spells module under `src/rpg/` — never built (the epic's old "dice, combat, achievements, crafting, encounters, spells" line named it in error)
- `character_stat_allocation` / `character_trait_assignments` tables, the `requires_stats` world config and the allocation modal — the six-stat-allocation slices below

## Acceptance Criteria

- [x] Character creation with mandatory fields validated
- [x] Optional fields with correct defaults
- [x] RPG stats calculate correctly — `src/rpg/stats/validation.test.ts` (bounds + `defaultStatBlock`) and `src/rpg/stats/modifiers.test.ts` (ability-modifier curve), verified 2026-10-09
- [x] Character API serves full character data
- [x] Tests passing

## Integration Points

> Added 2026-08-15 (matrix P6-G standardization — last of the 17 RPG sub-system epics
> to gain a formal section; was missing entirely).

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| Actor System | Identity, actor semantics | Characters are actors with role-specific fields |
| RPG Mechanics | Stat model, growth data | Stat/trait definitions feed character sheets |
| Memory / Knowledge Systems | Episodic/semantic storage | `MemoryEmotionImpact` contract — mood/coping weight episodic memories (G24) |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| RPG Mechanics | Stats, traits, growth data | Stat model feeds dice/stats checks; traits feed skills |
| Battle & Action Systems | Character stats | Combat stat calculation from character sheets |
| Companion, Pet & Mount | Traits, relationship state | Companion bonding ties to character traits |
| Social Interaction | Relationship state | NPC/player relationship model |
| Faction & Reputation | Faction affinity | Character allegiance feeds faction standing |
| NSFW Game Mechanics | Relationship, consent state | Encounter gating from character relationship |
| Emergent Narrative Design | Consequence persistence | Character state persists narrative stakes |
| Achievements | Stat-based progress | Stat-based achievement triggers |
| Assistant GM Flows | Character generation targets | GM flows generate characters through this system |

### Shared Data Contracts

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| `CharacterStats` | RPG, Battle, Social, Companion | STR/DEX/CON/WIS/INT/CHA shared across systems |
| `Relationship` | Social, Companion, NSFW | NPC/player relationship state |
| `MemoryEmotionImpact` | Memory / Knowledge Systems | Mood/coping weight on episodic memories (G24) |

### Cross-System Events

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| `character.stats_changed` | emits → RPG, Battle, Achievements | Stat changes propagate to systems reading stats |
| `character.relationship_changed` | emits → Social, Companion, Faction | Relationship shifts update dependent systems |
| `memory.emotion_applied` | subscribes ← Memory | Emotional weight applied to character memory (G24) |

---

## Related Epics

- `epic-actors.md` — characters are actors; this epic focuses on character-specific fields
- `epic-assistant-gm-flows.md` — character generation targets this system
- `epic-rpg-mechanics.md` — stat system integration
- `epic-character-spec.md` — spec details
- `epic-achievements.md` — stat-based achievements depend on character stats
- `epic-memory-knowledge-systems.md` — G24: shares `MemoryEmotionImpact` contract
  (mood/coping weight episodic memories; see Memory Architecture section below)
- `epic-wardrobe-avatar-variants.md` — seeded `CharacterTemplate` carries the per-character default outfit + loadout descriptor; the (outfit × emotion) variant key extends this epic's selection algorithm

## Linked Tasks

Statuses read from the ticket files on 2026-10-09.

- `TASK-character-core-system.md` (Done) — implementation tasks for this epic
- `TASK-character-template-seeding.md` (Not Started) — the seeding code ships (see the merged section below) but the ticket file is still open; close via `plan:sync`
- `TASK-character-rpg-stats.md` (Not Started) — the stat-allocation-era stat ticket; the stat system itself ships as of 2026-10-09
- `TASK-char-template-full-model-coverage.md` (Not Started) — template coverage for internal traits and voice
- `TASK-character-migration-route.md` (Not Started) — version-migration route (owned by `epic-character-spec.md`)

### Stat Allocation & Trait Selection (Extension — 2026-09-18)

When a world opts in via `requires_stats`, character creation/edit must allocate
a point-buy stat block and pick gameplay-impact traits. The catalog drives dice,
combat, and save outcomes; the modal surfaces the budget and trait picker to
authors. Implementation slices below; new tickets are sequenced DB → catalog →
engine → API → FE → tests so each phase has a verifiable boundary.

> **Verified 2026-10-09 — none of the six slices has started.** `requires_stats`,
> `stat_point_budget`, `stat_min`, `stat_max`, `character_stat_allocation` and
> `character_trait_assignments` appear nowhere in `src/` or `configs/`, and all six
> ticket files still read **Not Started**. The stat system this extension builds on
> *does* ship (`src/rpg/stats/`), so the sequence can start from a working base.

| Task | Ticket | Status |
| ---- | ------ | ------ |
| `worlds.requires_stats`, `stat_point_budget`, `stat_min`, `stat_max` columns | `TASK-world-requires-stats-flag-and-point-budget-config.md` | ⬜ Not Started |
| Typed trait catalog (`fast_reflexes`, `innate_magic`, `swift_hands`, …) | `TASK-character-trait-catalog-for-gameplay-mechanics.md` | ⬜ Not Started |
| `applyTraits`, `minimumRollValue`, `rollWithTraits` wired into combat/dice/saves | `TASK-character-stat-modifiers-and-trait-application-engine.md` | ⬜ Not Started |
| Migration 023 + `character_stat_allocation` / `character_trait_assignments` + PUT route | `TASK-character-stat-allocation-backend-api-and-db-integration.md` | ⬜ Not Started |
| htmx/Alpine modal + catalog endpoint, gated by `requires_stats` | `TASK-character-stat-allocation-frontend-modal-and-edit-integration.md` | ⬜ Not Started |
| DB + engine + route coverage, 80% floor | `TASK-character-stat-allocation-integration-tests-e2e.md` | ⬜ Not Started |

---

## Memory Architecture (Extension — Research-Driven)

Characters need structured memory to drive consistent, goal-directed behavior
across sessions. The four-tier memory architecture (from cognitive science and
production AI agent systems) provides the foundation:

### Four-Tier Memory Model

| Tier      | What it stores                          | Storage                | Retrieval rule                    | Lifetime        |
| --------- | --------------------------------------- | ---------------------- | --------------------------------- | --------------- |
| Working   | Current turn's context                  | In-process (prompt)    | Always in context                 | Seconds–minutes |
| Episodic  | Specific past events with timestamps    | Vector store + metadata| Similarity to current query       | Days–forever    |
| Semantic  | Extracted facts about user/world        | Relational schema      | Entity + relevance                | Forever, updated|
| Procedural| Learned routines and policies           | Versioned docs/DB      | Intent + role                     | Updated rarely  |

### Working Memory

The current turn's context window. Contains:
- System prompt + recent messages
- Current plan or sub-goals
- Intermediate results from tool calls
- Open approvals or interrupts
- Budget/step counter

**Does NOT contain:** anything that should survive restarts (→ episodic),
anything queryable later (→ semantic), anything describing how to work (→ procedural).

### Episodic Memory

Specific past events with timestamps. Examples:
- "Last Tuesday we discussed the API redesign"
- "Character A betrayed Character B in the dungeon"
- "The party defeated the dragon on turn 47"

**Storage:** Vector DB + metadata (timestamp, participants, location, emotional valence).
**Retrieval:** similarity search to current query + recency weighting.

### Semantic Memory

Extracted facts and preferences. Examples:
- "Character A trusts Character B (strength: 85)"
- "The merchant is secretly a thief"
- "Player prefers diplomatic solutions"

**Storage:** Relational schema (entity-attribute-value or structured JSON).
**Retrieval:** entity lookup + relevance scoring.

### Procedural Memory

Learned routines and policies. Examples:
- "When greeting a stranger, Character A bows formally"
- "In combat, Character B always protects the weakest party member"
- "When stressed, Character C withdraws and goes silent"

**Storage:** Versioned documents (git or DB).
**Retrieval:** intent matching + role filtering.

### Memory Consolidation

A background pipeline that runs during idle periods to:
1. **Merge** near-duplicate semantic facts
2. **Prune** low-importance episodic memories
3. **Strengthen** frequently accessed memories
4. **Abstract** patterns from episodic → semantic (e.g. "Character A has
   betrayed the party 3 times" → "Character A is untrustworthy")

```typescript
interface MemoryConsolidationConfig {
  enabled: boolean;
  run_interval_ms: number;        // how often to run (e.g. 60000 = 1 min)
  episodic_max_age_days: number;  // prune episodic memories older than this
  semantic_merge_threshold: number; // similarity threshold for merging facts
  abstraction_min_episodes: number; // min episodes before abstracting to semantic
}
```

### Integration with Character System

- **Episodic** memories are created from chat events, combat outcomes,
  relationship changes, and world events.
- **Semantic** facts are extracted from episodic memories by the consolidation
  pipeline and from explicit author input.
- **Procedural** routines are defined by the author (via personality, coping,
  approach) and refined by the consolidation pipeline.
- **Working** memory is assembled by the prompt builder from all three
  long-term tiers plus current context.

### Prompt Assembly

The prompt builder assembles working memory from:
1. **System prompt** (personality, internal traits, behavioral dimensions)
2. **Recent episodic** memories (last N events, weighted by recency + relevance)
3. **Semantic** facts (character relationships, world state, player preferences)
4. **Procedural** routines (behavioral patterns, coping strategies, approach tendencies)

### Schema (proposed)

```typescript
interface CharacterMemory {
  character_id: string;
  
  episodic: EpisodicMemory[];    // timestamped events
  semantic: SemanticFact[];      // extracted facts
  procedural: ProceduralRoutine[]; // learned behaviors
  
  consolidation: {
    last_run: Date;
    next_run: Date;
    config: MemoryConsolidationConfig;
  };
}

interface EpisodicMemory {
  id: string;
  timestamp: Date;
  event: string;               // what happened
  participants: string[];      // who was involved
  location?: string;           // where it happened
  emotional_valence: number;   // -100 (negative) to 100 (positive)
  importance: number;          // 0–100: how significant
  access_count: number;        // how often retrieved
  last_accessed: Date;
}

interface SemanticFact {
  id: string;
  subject: string;             // entity name
  predicate: string;           // relationship/attribute
  object: string;              // value
  confidence: number;          // 0–100: how certain
  source: "author" | "inferred" | "consolidated";
  last_updated: Date;
}

interface ProceduralRoutine {
  id: string;
  trigger: string;             // when this activates
  action: string;              // what to do
  priority: number;            // 0–100
  source: "author" | "learned";
  last_used: Date;
}
```

### Tasks

| Task | Description | Priority | Status |
|------|-------------|----------|--------|
| TASK-char-memory-schema | Add `CharacterMemory` types + `CanonicalCharacter` fields | High | Not Started |
| TASK-char-memory-db | Migration: memory tables (episodic, semantic, procedural) | High | Not Started |
| TASK-char-memory-consolidation | Background consolidation pipeline | Medium | Not Started |
| TASK-char-memory-prompt | Prompt assembly from all four memory tiers | High | Not Started |
| TASK-char-memory-api | CRUD routes for memory management | Medium | Not Started |
| TASK-char-memory-tests | Schema, consolidation, prompt, API tests | High | Not Started |

> **Verified 2026-10-09 — none of the six has started.** `001_init.ts` contains no
> episodic, semantic, procedural or consolidation tables (`actor_memories` at `:3072`
> is the existing single-bag store, unrelated to this four-tier design), and all six
> `TASK-char-memory-*` ticket files still read **Not Started**.

### Open Questions

1. Should episodic memories decay automatically, or only through consolidation?
2. How should semantic facts with conflicting confidence be resolved?
3. Should procedural routines be author-only, or can the system learn new ones?
4. How should memory consolidation interact with the mood system (emotional memories
   may be weighted differently)?
5. Should memory be per-character or shared across a party/world?

## Character Growth & Development (Extension — Research-Driven)

Characters evolve over time through experiences, challenges, and relationships.
This is distinct from personality (immutable) and mood (reactive state) — it is
the *trajectory* of a character's development arc.

### Growth Dimensions

Characters can grow in multiple dimensions:

```typescript
interface CharacterGrowth {
  character_id: string;
  
  // Skill progression
  skills: SkillProgression[];
  
  // Personality maturation
  personality_development: PersonalityDevelopment;
  
  // Relationship evolution
  relationship_milestones: RelationshipMilestone[];
  
  // Achievement tracking
  achievements: Achievement[];
  
  // Growth history
  growth_events: GrowthEvent[];
}

interface SkillProgression {
  skill_id: string;
  skill_name: string;
  current_level: number;
  experience: number;
  experience_to_next_level: number;
  
  // Skill-specific modifiers
  modifiers: SkillModifier[];
  
  // Skill history
  level_ups: LevelUpEvent[];
}

interface PersonalityDevelopment {
  // Personality traits that have evolved
  evolved_traits: EvolvedTrait[];
  
  // Core values that have strengthened/weakened
  value_changes: ValueChange[];
  
  // Fears that have been overcome
  fears_overcome: FearOvercome[];
  
  // Desires that have been fulfilled
  desires_fulfilled: DesireFulfilled[];
}

interface EvolvedTrait {
  trait: string;
  original_intensity: number;  // 0–100
  current_intensity: number;   // 0–100
  evolution_events: string[];  // what caused the change
}
```

### Growth Events

Events that trigger character growth:

```typescript
interface GrowthEvent {
  id: string;
  character_id: string;
  timestamp: Date;
  event_type: GrowthEventType;
  description: string;
  
  // Growth impact
  skill_changes: Array<{
    skill_id: string;
    experience_gained: number;
  }>;
  
  personality_changes: Array<{
    trait: string;
    intensity_change: number;
  }>;
  
  // Narrative significance
  poignancy_score: number;     // 0–100: how significant
  memory_importance: number;   // 0–100: how memorable
}

type GrowthEventType =
  | "combat_victory"          // won a fight
  | "combat_defeat"           // lost a fight
  | "skill_use"               // successfully used a skill
  | "skill_failure"           // failed at a skill
  | "relationship_change"     // relationship evolved
  | "world_event"             // significant world event
  | "personal_challenge"      // faced a personal challenge
  | "moral_choice"            // made a moral decision
  | "loss"                    // lost something important
  | "discovery"               // discovered something new
  | "teaching"                // taught someone something
  | "learning"                // learned from someone
  | "sacrifice"               // made a sacrifice
  | "betrayal"                // experienced betrayal
  | "forgiveness"             // forgave or was forgiven
  | "achievement"             // accomplished a goal
  | "failure"                 // failed at a goal
  | "transformation"          // underwent significant change;
```

### Narrative Milestones

Significant growth thresholds that trigger story events:

```typescript
interface NarrativeMilestone {
  id: string;
  name: string;
  description: string;
  
  // Conditions
  conditions: {
    min_level?: number;
    required_skills?: string[];
    required_achievements?: string[];
    required_relationship_milestones?: string[];
    required_growth_events?: string[];
  };
  
  // Effects
  effects: {
    skill_unlocks?: string[];
    personality_changes?: PersonalityChange[];
    story_unlocks?: string[];
    dialogue_changes?: string[];
    behavior_changes?: string[];
  };
  
  // Narrative
  narrative_description: string;
  notification_message?: string;
}
```

### Character Arc Templates

Pre-defined character development arcs:

```typescript
interface CharacterArc {
  id: string;
  name: string;
  description: string;
  
  // Arc phases
  phases: CharacterArcPhase[];
  
  // Arc triggers
  triggers: {
    min_growth_events: number;
    required_milestones: string[];
    time_requirements?: number; // days
  };
}

interface CharacterArcPhase {
  name: string;
  description: string;
  
  // Phase effects
  personality_changes: PersonalityChange[];
  skill_bonuses: SkillBonus[];
  behavior_modifiers: BehaviorModifier[];
  
  // Phase transitions
  transition_conditions: {
    required_growth_events: string[];
    required_milestones: string[];
  };
}
```

### Integration with Memory System

Character growth events are stored in memory:

1. **Episodic memory** — growth events are stored as significant memories
2. **Semantic memory** — skill levels and personality traits are tracked
3. **Procedural memory** — new behaviors learned through growth are stored
4. **Working memory** — current growth state influences immediate behavior

### Prompt Assembly

When generating dialogue or behavior, the prompt includes:
1. **Current skill levels** — what the character is good at
2. **Personality development** — how their personality has evolved
3. **Recent growth events** — what they've experienced recently
4. **Active arcs** — what character arc they're currently in
5. **Milestone effects** — what behavior/dialogue changes are unlocked

### Tasks

| Task | Description | Priority | Status |
|------|-------------|----------|--------|
| TASK-char-growth-schema | Add `CharacterGrowth` types + `CanonicalCharacter` fields | High | Shipped (verified 2026-10-09) — `character_arc` (`001_init.ts:1096`) + `growth_log` (`:1106`), types in `src/characters/spec/growth.ts`; `CanonicalCharacter` grew `growth_mode`/`llm_assist_enabled` rather than a `CharacterGrowth` struct |
| TASK-char-growth-events | Growth event system with typed events | High | Partial (verified 2026-10-09) — `GrowthEventType` in `spec/growth.ts` covers arc/skill/trait/relationship/observation only; the wider taxonomy below (moral_choice, betrayal, sacrifice, …) is unimplemented |
| TASK-char-growth-milestones | Narrative milestone thresholds | Medium | Not Started (verified 2026-10-09) — no `narrative_milestone` table |
| TASK-char-growth-arcs | Character arc templates and progression | Medium | Partial (verified 2026-10-09) — `character_arc` carries `current_stage` only; no arc phases or templates |
| TASK-char-growth-memory | Integration with memory system | High | Not Started (verified 2026-10-09) — blocked by the four-tier memory rows above |
| TASK-char-growth-prompt | Prompt assembly for growth context | High | Shipped (verified 2026-10-09) — `src/assistant/prompt/sections/actor-growth.ts`, registered at `src/assistant/prompt/registry.ts:56` |
| TASK-char-growth-tests | Growth events, milestones, arcs, memory tests | High | Shipped for what exists (verified 2026-10-09) — growth-service, routes and section coverage; see `epic-character-growth.md` |

### Open Questions

1. Should character growth be visible to players, or only noticeable through behavior?
2. How should NPCs handle conflicting growth events (positive and negative)?
3. Should narrative milestones be automatic, or require player/NPC action?
4. How should character growth scale with world size?
5. Should NPCs be able to have multiple character arcs simultaneously?

---

## Merged from `.plan/epics/epic-character-core-system.md`

# Feature: Character Template Seeding

**Status:** Done
**Status Note:** verified 2026-10-09 — seeding runs at startup from `src/server/init-background-services.ts:37-52` (`mergeCharacterTemplates` + `seedCharacterTemplates`); the flat paths this block used to cite (`sections/characters.ts`, `templates-loader.ts`, `seed.ts`, `server.ts`) never existed in that shape and are corrected in the Files split below. The ticket file `.plan/tickets/TASK-character-template-seeding.md` still reads Not Started.
**Epic:** 46 (Creative Studio) — related
**Files:** see the Files split at the end of this section

## Summary

Default character templates are automatically seeded on app start. Built-in defaults (6 characters) are always seeded; user character files from `configs/characters/` are merged by name. Supports hard IDs for deterministic test reseeding.

## Key Capabilities

### 1. Built-in Default Characters

Six characters shipped with the app:

| Character          | Genre         | Role                    | ID                       |
| ------------------ | ------------- | ----------------------- | ------------------------ |
| Elara Nightwhisper | Fantasy       | Guide/lore sage         | `tpl-elara-nightwhisper` |
| ARIA-7             | Sci-Fi        | AI companion            | `tpl-aria-7`             |
| Detective Morgan   | Modern        | Mystery solver          | `tpl-detective-morgan`   |
| Dr. Alexis Thorne  | Horror        | Paranormal investigator | `tpl-dr-thorne`          |
| Yuki Tanaka        | Slice of Life | Neighbor/friend         | `tpl-yuki-tanaka`        |
| Assistant          | Assistant     | Helpful AI              | `tpl-assistant`          |

### 2. Character File Loading

Characters can be defined in two ways:

**Single-character files** (`configs/characters/elara-nightwhisper.yaml`):

```yaml
id: "tpl-elara-nightwhisper"
name: "Elara Nightwhisper"
description: "An ancient elven sage..."
# ... other fields
```

**Multi-character files** (`configs/characters/group-fantasy-scifi.yaml`):

```yaml
templates:
  - name: "Character 1"
    description: "..."
  - name: "Character 2"
    description: "..."
```

### 3. Hard IDs for Test Reseeding

Characters can have deterministic IDs (`id: "tpl-elara-nightwhisper"`) for:

- Easy DB cleanup in tests
- Deterministic test fixtures
- Migration testing

### 4. Access Control

Each template supports:

- `visibility`: `"private"` | `"public"` — who can see the character
- `content_rating`: `"sfw"` | `"nsfw_*"` — content classification
- `target_roles`: `("admin" | "user" | "viewer" | "solo")[]` — which user roles can use

### 5. Admin Configuration

- `is_template`: Can be used as template for user-created characters
- `is_default`: Auto-add to new users' character list

## Configuration

### Built-in Defaults

Always seeded from `CHARACTERS_DEFAULTS` in `src/config/sections/characters.ts`.

### Character Files

Place `.yaml`, `.yml`, or `.toml` files in `configs/characters/`:

```yaml
# Single character
id: "tpl-my-character"
name: "My Character"
description: "A character description"
visibility: "public"
content_rating: "sfw"
target_roles: ["user", "admin"]
is_template: true
is_default: true
```

### Template Config Override

Also supported via `configs/templates/character.yaml`:

```yaml
merge: extend # extend | override | replace
templates:
  - name: "My Character"
    description: "..."
```

## Wardrobe / Loadout Hook (cross-ref)

This epic's `CharacterTemplate` is the natural surface to **seed default outfits and loadouts**
for new characters/NPCs. The (outfit × emotion) variant key, the (outfit, emotion) resolution
fallback ladder, and the wardrobe descriptor prompt slot live in
`epic-wardrobe-avatar-variants.md` — when that epic lands, the seeded templates here should
declare one default `outfit` per character and an optional `loadout[]` mapping equipped items
to outfit descriptors (deferred phase of the wardrobe epic).

## Merge Logic

1. Load built-in `CHARACTERS_DEFAULTS.templates`
2. Load character files from `configs/characters/`
3. Load `configs/templates/character.yaml` (if exists)
4. Merge all by name (case-insensitive) — later sources override earlier
5. Seed merged list (idempotent — skip existing)

## Seeding Flow

1. `server.ts` calls `loadTemplateConfig()` → loads all templates including characters
2. `mergeCharacterTemplates()` merges built-in + template-loaded
3. `seedCharacterTemplates()` seeds merged list
4. For each template:
   - Check if exists by `display_name` + `owner_id`
   - If exists: skip
   - If not: insert with hard ID or generated ID

## Files

- `src/config/sections/characters.ts` — Config schema + built-in defaults
- `src/config/character-loader.ts` — Character file loader (configs/characters/)
- `src/config/templates-loader.ts` — Template loader with character support
- `src/config/schema.ts` — `CharactersConfig` interface
- `src/characters/seed.ts` — Seeder + merge function
- `src/server.ts` — Startup integration
- `configs/characters/*.yaml` — Example character files
- `configs/templates/character.example.yaml` — Example template config
- `.plan/tickets/TASK-character-template-seeding.md` — Task tracking
